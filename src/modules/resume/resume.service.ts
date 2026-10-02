import status from 'http-status';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer-core';
import { Prisma } from '../../../prisma/generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { getAiResponse } from '../../utils/aiResponse';
import { recordAiUsage } from '../../utils/aiUsage';
import { uploadBuffer, getPresignedUrl } from '../../lib/minio';
import { envVars } from '../../config/env';
import AppError from '../../errorHelpers/AppError';
import {
  GenerateResumeInput,
  UpdateResumeInput,
  AtsCheckInput,
  AiModifyInput,
  UpdateResumeTemplateInput,
  ShareResumeInput,
} from './resume.schema';
import { buildTemplateSnapshotDocx } from './resumeDocument';

type JsonObject = Record<string, unknown>;

const asObject = (value: unknown): JsonObject =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};

const asObjects = (value: unknown): JsonObject[] =>
  Array.isArray(value) ? value.map(asObject) : [];

const asStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const stringValue = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

const firstNonEmpty = (...values: unknown[]): string => {
  for (const value of values) {
    const candidate = stringValue(value).trim();
    if (candidate) return candidate;
  }
  return '';
};

const DEPTH_POLICY = {
  CONCISE: { summaryWords: '60-90', recentBullets: '2-3', olderBullets: '1-2', pageIntent: 'one focused page' },
  STANDARD: { summaryWords: '90-130', recentBullets: '3-5', olderBullets: '2-3', pageIntent: 'one to two pages' },
  DETAILED: { summaryWords: '120-170', recentBullets: '4-6', olderBullets: '3-4', pageIntent: 'a detailed two-page document' },
  COMPREHENSIVE: { summaryWords: '140-200', recentBullets: '5-7', olderBullets: '3-5', pageIntent: 'a comprehensive CV with full career history' },
} as const;

const contentStrength = (value: unknown): number => {
  const data = asObject(value);
  return firstNonEmpty(data.summary, data.bio).split(/\s+/).filter(Boolean).length
    + asObjects(data.experience).reduce((sum, row) => sum + asStrings(row.bullets).length * 18, 0)
    + asObjects(data.projects).length * 20;
};

/**
 * AI is allowed to improve wording and prioritise skills, but it must not be
 * the source of truth for identity, employment, education, or credentials.
 * This projection deterministically overlays verified profile facts after AI
 * generation and fills any omitted sections from the profile.
 */
const mergeGeneratedWithProfile = (
  profile: JsonObject,
  aiValue: unknown,
  targetJobTitle: string,
): JsonObject => {
  const ai = asObject(aiValue);
  const aiPersonal = asObject(ai.personalInfo);
  const profileExperience = asObjects(profile.experience);
  const aiExperience = asObjects(ai.experience);
  const profileEducation = asObjects(profile.education);
  const aiEducation = asObjects(ai.education);
  const profileCertifications = asObjects(profile.certifications);
  const aiCertifications = asObjects(ai.certifications);
  const profileSkills = asStrings(profile.skills);
  const aiSkills = asStrings(ai.skills);
  const profileSkillLookup = new Map(
    profileSkills.map((skill) => [skill.toLocaleLowerCase(), skill]),
  );
  const prioritisedSkills = aiSkills
    .map((skill) => profileSkillLookup.get(skill.toLocaleLowerCase()))
    .filter((skill): skill is string => Boolean(skill));
  const skills = [...new Set([...prioritisedSkills, ...profileSkills])];
  const groundingText = [
    ...profileExperience.map((item) => firstNonEmpty(item.desc, item.description)),
    ...asObjects(profile.projects).map((item) => firstNonEmpty(item.description)),
    ...asObjects(profile.confirmedEvidence).map((item) => firstNonEmpty(item.statement)),
  ].join(' ');
  const allowedNumbers = new Set(groundingText.match(/\b\d+(?:\.\d+)?%?\b/g) ?? []);
  const groundedBullets = (items: string[]) => items.filter((bullet) => {
    const numbers = bullet.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
    return numbers.every((number) => allowedNumbers.has(number));
  });

  const experience = profileExperience.map((source, index) => {
    const enhanced = aiExperience[index] ?? {};
    const sourceDescription = firstNonEmpty(source.desc, source.description);
    const enhancedBullets = groundedBullets(asStrings(enhanced.bullets));
    return {
      ...enhanced,
      company: firstNonEmpty(source.company),
      role: firstNonEmpty(source.role, source.title),
      location: firstNonEmpty(source.location),
      from: firstNonEmpty(source.from, source.startDate),
      to: firstNonEmpty(source.to, source.endDate),
      current: Boolean(source.current),
      bullets: enhancedBullets.length
        ? enhancedBullets
        : sourceDescription
          ? sourceDescription.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
          : [],
    };
  });

  const education = profileEducation.map((source, index) => {
    const enhanced = aiEducation[index] ?? {};
    return {
      ...enhanced,
      school: firstNonEmpty(source.school, source.institution),
      degree: firstNonEmpty(source.degree),
      field: firstNonEmpty(source.field),
      from: firstNonEmpty(source.from, source.startDate),
      to: firstNonEmpty(source.to, source.endDate),
      gpa: firstNonEmpty(source.gpa),
    };
  });

  const certifications = profileCertifications.map((source, index) => {
    const enhanced = aiCertifications[index] ?? {};
    return {
      ...enhanced,
      name: firstNonEmpty(source.name),
      issuer: firstNonEmpty(source.issuer),
      year: firstNonEmpty(source.year),
      url: firstNonEmpty(source.url),
    };
  });

  const summary = firstNonEmpty(
    ai.summary,
    ai.bio,
    profile.bio,
    `${firstNonEmpty(profile.headline, targetJobTitle)} targeting ${targetJobTitle}`,
  );
  const sourceProjects = asObjects(profile.projects);
  const aiProjects = asObjects(ai.projects);
  const projects = sourceProjects.map((source, index) => ({
    ...aiProjects[index],
    title: firstNonEmpty(source.title),
    description: firstNonEmpty(aiProjects[index]?.description, source.description),
    techStack: asStrings(source.techStack),
    url: firstNonEmpty(source.url),
    repoUrl: firstNonEmpty(source.repoUrl),
    startDate: firstNonEmpty(source.startDate),
    endDate: firstNonEmpty(source.endDate),
    current: Boolean(source.current),
  }));
  const evidenceHighlights = asObjects(profile.confirmedEvidence).map((item) => ({
    title: firstNonEmpty(item.title), statement: firstNonEmpty(item.statement), technologies: asStrings(item.technologies), source: firstNonEmpty(item.source),
  }));

  return {
    ...ai,
    summary,
    experience,
    education,
    skills,
    languages: asStrings(profile.languages),
    certifications,
    projects,
    evidenceHighlights,
    personalInfo: {
      ...aiPersonal,
      firstName: firstNonEmpty(profile.firstName),
      lastName: firstNonEmpty(profile.lastName),
      email: firstNonEmpty(profile.email),
      phone: firstNonEmpty(profile.phone),
      location: firstNonEmpty(profile.location),
      headline: firstNonEmpty(profile.headline),
      website: firstNonEmpty(profile.website),
      linkedIn: firstNonEmpty(profile.linkedIn),
      github: firstNonEmpty(profile.github),
    },
  };
};

const toTemplateContext = (value: unknown): JsonObject => {
  const data = asObject(value);
  const personalInfo = asObject(data.personalInfo);
  return {
    ...data,
    ...personalInfo,
    bio: firstNonEmpty(data.bio, data.summary),
    experience: asObjects(data.experience).map((item) => ({
      ...item,
      role: firstNonEmpty(item.role, item.title),
      from: firstNonEmpty(item.from, item.startDate),
      to: firstNonEmpty(item.to, item.endDate),
      desc: firstNonEmpty(item.desc, asStrings(item.bullets).join('\n')),
    })),
    education: asObjects(data.education).map((item) => ({
      ...item,
      school: firstNonEmpty(item.school, item.institution),
      from: firstNonEmpty(item.from, item.startDate),
      to: firstNonEmpty(item.to, item.endDate),
    })),
  };
};

const renderTemplateHtml = (
  contentData: unknown,
  template: { htmlLayout: string; cssStyles: string },
  pageSize: 'A4' | 'Letter' = 'A4',
): string => {
  const compiled = Handlebars.compile(template.htmlLayout);
  const content = compiled(toTemplateContext(contentData));
  const dimensions = pageSize === 'Letter' ? '8.5in 11in' : '210mm 297mm';
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
@page{size:${dimensions};margin:0}
html,body{margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
*,*::before,*::after{box-sizing:border-box}
.profileai-template-stage{width:100%;min-height:100vh;background:#fff;overflow:hidden}
${template.cssStyles}
</style></head><body><main class="profileai-template-stage">${content}</main></body></html>`;
};

const browserExecutable = (): string | null => {
  const configured = process.env.CHROME_EXECUTABLE_PATH?.trim();
  const candidates = [
    configured,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter((path): path is string => Boolean(path));
  return candidates.find((path) => existsSync(path)) ?? null;
};

const renderPdfWithLocalBrowser = async (
  html: string,
  pageSize: 'A4' | 'Letter',
): Promise<Buffer> => {
  const executablePath = browserExecutable();
  if (!executablePath) throw new Error('No local Chromium browser was found.');
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);
    const bytes = await page.pdf({
      format: pageSize,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    return Buffer.from(bytes);
  } finally {
    await browser.close();
  }
};

const renderTemplatePngPages = async (
  html: string,
  pageSize: 'A4' | 'Letter' = 'A4',
): Promise<Buffer[]> => {
  const executablePath = browserExecutable();
  if (!executablePath) throw new Error('No local Chromium browser was found.');
  const dimensions = pageSize === 'Letter'
    ? { width: 816, height: 1056 }
    : { width: 794, height: 1123 };
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ ...dimensions, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'load', timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);
    const contentHeight = await page.evaluate(() => Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
    ));
    const pageCount = Math.max(1, Math.ceil(contentHeight / dimensions.height));
    await page.evaluate(
      (height) => { document.body.style.minHeight = `${height}px`; },
      pageCount * dimensions.height,
    );

    const pages: Buffer[] = [];
    for (let index = 0; index < pageCount; index += 1) {
      const bytes = await page.screenshot({
        type: 'png',
        captureBeyondViewport: true,
        clip: {
          x: 0,
          y: index * dimensions.height,
          width: dimensions.width,
          height: dimensions.height,
        },
      });
      pages.push(Buffer.from(bytes));
    }
    return pages;
  } finally {
    await browser.close();
  }
};

// ─── AI Resume Generation Prompt ─────────────────────

const buildResumePrompt = (profile: Record<string, unknown>, input: GenerateResumeInput): string => {
  const selectedDepth = input.contentDepth ?? 'STANDARD';
  const depth = DEPTH_POLICY[selectedDepth];
  return `
You are an expert resume writer and career coach. Generate a professional, ATS-optimized resume for the following person targeting the specified job title.

== CANDIDATE PROFILE ==
Name: ${profile.firstName} ${profile.lastName}
Email: ${profile.email || ''}
Phone: ${profile.phone || ''}
Location: ${profile.location || ''}
Headline: ${profile.headline || ''}
Bio: ${profile.bio || ''}
Skills: ${JSON.stringify(profile.skills || [])}
Languages: ${JSON.stringify(profile.languages || [])}
Experience: ${JSON.stringify(profile.experience || [])}
Education: ${JSON.stringify(profile.education || [])}
Certifications: ${JSON.stringify(profile.certifications || [])}
Projects: ${JSON.stringify(profile.projects || [])}
Confirmed career evidence: ${JSON.stringify(profile.confirmedEvidence || [])}

== TARGET POSITION ==
Job Title: ${input.targetJobTitle}
${input.jobDescription ? `Job Description:\n${input.jobDescription}` : ''}

== INSTRUCTIONS ==
1. Write a compelling professional summary (3-4 sentences) tailored to the job title
2. Enhance experience bullet points to be achievement-focused with metrics where possible
3. Highlight skills most relevant to the target role
4. Ensure ATS-friendly formatting
5. Use action verbs for experience descriptions
6. Never invent employers, job titles, schools, dates, credentials, contact details, or skills
7. Preserve every profile experience, education, language, and certification entry
8. Content depth is ${selectedDepth}: target ${depth.pageIntent}, a ${depth.summaryWords}-word summary, ${depth.recentBullets} evidence-grounded bullets for recent roles, and ${depth.olderBullets} for older roles
9. Use confirmed projects and career evidence where relevant; never attach an achievement to an employer unless the supplied data explicitly connects them
10. Do not pad thin source material. If facts are insufficient, write specific metric-free bullets instead of inventing details
`;
};

type AtsRequirement = {
  label: string;
  priority: 'required' | 'responsibility' | 'preferred';
  category: 'skill' | 'experience' | 'qualification' | 'responsibility' | 'tool' | 'domain';
  aliases: string[];
};

type SemanticCandidate = { requirement: string; evidence: string; confidence: number };

type AtsAiAnalysis = {
  requirements?: AtsRequirement[];
  semanticMatches?: SemanticCandidate[];
  suggestions?: Array<{ section: string; issue: string; suggestion: string }>;
};

const normalizeAtsText = (value: unknown): string => stringValue(value)
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}+#.]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const atsChunks = (contentData: JsonObject) => {
  const chunks: Array<{ section: string; text: string; strength: number }> = [];
  const add = (section: string, value: unknown, strength: number) => {
    const text = stringValue(value).trim();
    if (text) chunks.push({ section, text, strength });
  };
  add('summary', contentData.summary ?? contentData.bio, 0.35);
  asStrings(contentData.skills).forEach((value) => add('skills', value, 0.25));
  asObjects(contentData.experience).forEach((row) => {
    add('experience', [firstNonEmpty(row.role, row.title), row.company].filter(Boolean).join(' — '), 0.65);
    asStrings(row.bullets).forEach((value) => add('experience', value, /\b\d+(?:\.\d+)?%?\b/.test(value) ? 1 : 0.8));
  });
  asObjects(contentData.projects).forEach((row) => {
    add('projects', firstNonEmpty(row.title, row.name), 0.7);
    add('projects', row.description, /\b\d+(?:\.\d+)?%?\b/.test(stringValue(row.description)) ? 1 : 0.8);
    asStrings(row.techStack).forEach((value) => add('projects', value, 0.7));
  });
  asObjects(contentData.education).forEach((row) => add('education', [firstNonEmpty(row.degree), firstNonEmpty(row.field), firstNonEmpty(row.school, row.institution)].filter(Boolean).join(' '), 0.65));
  asObjects(contentData.certifications).forEach((row) => add('certifications', [row.name, row.issuer].filter(Boolean).join(' '), 0.7));
  return chunks;
};

const fallbackRequirements = (jobDescription: string): AtsRequirement[] => {
  const stop = new Set(['and','the','with','for','that','this','from','will','your','you','our','are','have','has','years','work','role','team']);
  const counts = new Map<string, number>();
  for (const token of normalizeAtsText(jobDescription).split(' ')) {
    if (token.length < 3 || stop.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([label]) => ({ label, priority: 'required', category: 'skill', aliases: [] }));
};

const buildAtsPrompt = (contentData: Record<string, unknown>, jobDescription: string): string => {
  return `
Extract structured job requirements and identify semantic evidence candidates. Do not calculate the final score; application code calculates it deterministically.

== RESUME CONTENT ==
${JSON.stringify(contentData, null, 2)}

== JOB DESCRIPTION ==
${jobDescription}

Return JSON with this exact structure:
{
  "requirements": [{
    "label": "canonical requirement",
    "priority": "required | responsibility | preferred",
    "category": "skill | experience | qualification | responsibility | tool | domain",
    "aliases": ["only genuine aliases from the job description"]
  }],
  "semanticMatches": [{
    "requirement": "exact canonical requirement label",
    "evidence": "an exact short quote copied from the resume content",
    "confidence": <number 0.60-0.85>
  }],
  "suggestions": [
    { "section": "<section name>", "issue": "<issue>", "suggestion": "<improved text>" }
  ]
}
Rules: extract at most 20 distinct requirements; distinguish required, responsibilities, and preferred items; never invent resume evidence; evidence must be a verbatim resume quote; do not treat keyword repetition as stronger evidence.
`;
};

// ─── List Resumes ─────────────────────────────────────

export const listResumes = async (
  userId: string,
  page = 1,
  limit = 10,
  type?: string,
  resumeStatus?: string
) => {
  const where = {
    userId,
    ...(type ? { type: type as any } : {}),
    ...(resumeStatus ? { status: resumeStatus as any } : {}),
  };

  const [resumes, total] = await Promise.all([
    prisma.resume.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            category: true,
            thumbnailUrl: true,
            htmlLayout: true,
            cssStyles: true,
          },
        },
      },
    }),
    prisma.resume.count({ where }),
  ]);

  return {
    resumes,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// ─── Get Resume ───────────────────────────────────────

export const getResume = async (userId: string, resumeId: string) => {
  const resume = await prisma.resume.findFirst({
    where: { id: resumeId, userId },
    include: { template: true },
  });
  if (!resume) throw new AppError(status.NOT_FOUND, 'Resume not found.');
  return resume;
};

// ─── Generate Resume ──────────────────────────────────

export const generateResume = async (userId: string, input: GenerateResumeInput) => {
  // Check limits
  const limits = await prisma.userLimit.findUnique({ where: { userId } });
  if (!limits) throw new AppError(status.BAD_REQUEST, 'User limits not configured.');
  if (limits.resumeUsed >= limits.resumeLimit) {
    throw new AppError(status.FORBIDDEN, `Resume limit reached (${limits.resumeLimit}/month).`, 'RESUME_LIMIT_REACHED');
  }
  if (limits.apiUsed >= limits.apiLimit) {
    throw new AppError(status.FORBIDDEN, `API call limit reached (${limits.apiLimit}/month).`, 'API_LIMIT_REACHED');
  }

  // Fetch user profile
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!profile) throw new AppError(status.BAD_REQUEST, 'Please complete your profile before generating a resume.');

  // Verify template exists
  const template = await prisma.resumeTemplate.findFirst({
    where: {
      id: input.templateId,
      isActive: true,
      OR: [{ reviewStatus: 'APPROVED' }, { ownerId: userId }],
    },
  });
  if (!template) throw new AppError(status.NOT_FOUND, 'Template not found.');

  const [account, projects, confirmedEvidence] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    prisma.project.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 30 }),
    prisma.careerEvidence.findMany({ where: { userId, status: { in: ['VERIFIED', 'USER_CONFIRMED'] } }, orderBy: { updatedAt: 'desc' }, take: 50 }),
  ]);
  const profileData = {
    ...profile,
    email: account?.email,
    projects,
    confirmedEvidence,
  };

  const prompt = buildResumePrompt(profileData as Record<string, unknown>, input);

  const responseStyle = `Return a JSON object representing a complete grounded career document with these sections:
{
  "summary": "Professional summary text",
  "experience": [{ "company": "", "role": "", "from": "", "to": "", "current": false, "bullets": [""] }],
  "education": [{ "school": "", "degree": "", "field": "", "from": "", "to": "", "gpa": "" }],
  "projects": [{ "title": "", "description": "", "techStack": [""], "url": "", "repoUrl": "" }],
  "skills": [""],
  "languages": [""],
  "certifications": [{ "name": "", "issuer": "", "year": "" }],
  "personalInfo": { "firstName": "", "lastName": "", "email": "", "phone": "", "location": "", "headline": "", "website": "", "linkedIn": "", "github": "" }
}`;
  let aiResult = await getAiResponse<Record<string, unknown>>({
    context: prompt,
    responseStyle,
    responseTime: 30000,
    retryNumber: 3,
  });

  if (!aiResult.success || !aiResult.data) {
    throw new AppError(status.INTERNAL_SERVER_ERROR, 'AI generation failed. Please try again.');
  }

  const selectedDepth = input.contentDepth ?? 'STANDARD';
  const minimumStrength = selectedDepth === 'CONCISE' ? 70 : selectedDepth === 'STANDARD' ? 110 : selectedDepth === 'DETAILED' ? 150 : 180;
  if (contentStrength(aiResult.data) < minimumStrength) {
    const expanded = await getAiResponse<Record<string, unknown>>({
      context: `${prompt}\n\nThe first draft was too sparse. Produce a fuller version using only the supplied facts. Expand responsibilities into distinct, non-repetitive, metric-free bullets when no confirmed metric exists. Do not add claims merely to reach a length target.`,
      responseStyle,
      responseTime: 30000,
      retryNumber: 1,
      aiModel: aiResult.model,
    });
    if (expanded.success && expanded.data && contentStrength(expanded.data) > contentStrength(aiResult.data)) aiResult = expanded;
  }

  const contentData = mergeGeneratedWithProfile(
    profileData as JsonObject,
    aiResult.data,
    input.targetJobTitle,
  );

  const createData: Prisma.ResumeUncheckedCreateInput = {
    userId,
    templateId: input.templateId,
    title: input.title,
    type: template.documentType,
    status: 'GENERATED',
    targetJobTitle: input.targetJobTitle,
    contentData: contentData as Prisma.InputJsonValue,
    version: 1,
  };
  if (input.jobDescription !== undefined) createData.jobDescription = input.jobDescription;
  const resume = await prisma.resume.create({
    data: createData,
    include: { template: true },
  });

  // Increment usage counters
  await prisma.userLimit.update({
    where: { userId },
    data: { resumeUsed: { increment: 1 }, apiUsed: { increment: 1 } },
  });
  await prisma.userProfile.update({
    where: { userId },
    data: { resumeCount: { increment: 1 }, apiCallCount: { increment: 1 } },
  });

  await recordAiUsage(userId, 'resume_generation');

  return resume;
};

// ─── Update Resume ────────────────────────────────────

export const updateResume = async (userId: string, resumeId: string, data: UpdateResumeInput) => {
  const existing = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!existing) throw new AppError(status.NOT_FOUND, 'Resume not found.');

  // Save history snapshot before update
  await prisma.resumeHistory.create({
    data: {
      resumeId,
      version: existing.version,
      snapshot: existing.contentData as object,
      changedBy: userId,
    },
  });

  const updateData: Prisma.ResumeUpdateInput = {
    contentData: data.contentData ? (data.contentData as unknown as Prisma.InputJsonValue) : (existing.contentData as Prisma.InputJsonValue),
    version: existing.version + 1,
  };
  if (data.title !== undefined) updateData.title = data.title;
  if (data.targetJobTitle !== undefined) updateData.targetJobTitle = data.targetJobTitle;
  if (data.jobDescription !== undefined) updateData.jobDescription = data.jobDescription;
  return prisma.resume.update({
    where: { id: resumeId },
    data: updateData,
    include: { template: true },
  });
};

// ─── Delete Resume ────────────────────────────────────

export const deleteResume = async (userId: string, resumeId: string) => {
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume) throw new AppError(status.NOT_FOUND, 'Resume not found.');
  await prisma.resume.delete({ where: { id: resumeId } });
  return { message: 'Resume deleted.' };
};

// ─── ATS Check ───────────────────────────────────────

export const runAtsCheck = async (userId: string, resumeId: string, data: AtsCheckInput) => {
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId }, include: { template: true } });
  if (!resume) throw new AppError(status.NOT_FOUND, 'Resume not found.');

  const sourceHash = createHash('sha256')
    .update(JSON.stringify({ contentData: resume.contentData, jobDescription: data.jobDescription, templateId: resume.templateId }))
    .digest('hex');
  const priorAnalysis = asObject(resume.aiSuggestions);
  if (priorAnalysis.methodologyVersion === 'hybrid-v1' && priorAnalysis.analysisMode === 'FULL_HYBRID' && priorAnalysis.sourceHash === sourceHash) {
    return { resume, atsData: priorAnalysis };
  }

  const limits = await prisma.userLimit.findUnique({ where: { userId } });
  let aiData: AtsAiAnalysis = {};
  let usedAi = false;
  if (limits && limits.apiUsed < limits.apiLimit) {
    try {
      const aiResult = await getAiResponse<AtsAiAnalysis>({
        context: buildAtsPrompt(resume.contentData as Record<string, unknown>, data.jobDescription),
        responseStyle: 'Return JSON with requirements, semanticMatches, and suggestions. Do not return a final score.',
        responseTime: 20000,
        retryNumber: 2,
      });
      if (aiResult.success && aiResult.data && Array.isArray(aiResult.data.requirements) && aiResult.data.requirements.length > 0) {
        aiData = aiResult.data;
        usedAi = true;
      }
    } catch (error) {
      console.warn('[ATS] AI analysis unavailable; using deterministic fallback.', error);
    }
  }

  const content = asObject(resume.contentData);
  const chunks = atsChunks(content);
  const allResumeText = normalizeAtsText(chunks.map((chunk) => chunk.text).join(' '));
  const rawRequirements = Array.isArray(aiData.requirements) ? aiData.requirements : [];
  const requirements = rawRequirements.slice(0, 20).map((item): AtsRequirement => ({
    label: stringValue(item?.label).trim(),
    priority: ['required', 'responsibility', 'preferred'].includes(item?.priority) ? item.priority : 'required',
    category: ['skill', 'experience', 'qualification', 'responsibility', 'tool', 'domain'].includes(item?.category) ? item.category : 'skill',
    aliases: asStrings(item?.aliases).slice(0, 8),
  })).filter((item) => item.label.length >= 2);
  const finalRequirements = requirements.length ? requirements : fallbackRequirements(data.jobDescription);
  const semanticCandidates = Array.isArray(aiData.semanticMatches) ? aiData.semanticMatches : [];
  const priorityWeight = { required: 1, responsibility: 0.8, preferred: 0.5 } as const;

  const requirementResults = finalRequirements.map((requirement) => {
    const terms = [requirement.label, ...requirement.aliases].map(normalizeAtsText).filter(Boolean);
    let bestChunk: (typeof chunks)[number] | undefined;
    let matchType: 'exact' | 'alias' | 'semantic' | 'missing' = 'missing';
    let matchConfidence = 0;
    chunks.forEach((chunk) => {
      const text = normalizeAtsText(chunk.text);
      terms.forEach((term, index) => {
        if (term && text.includes(term)) {
          const confidence = index === 0 ? 1 : 0.9;
          if (confidence > matchConfidence || (confidence === matchConfidence && chunk.strength > (bestChunk?.strength ?? 0))) {
            matchConfidence = confidence;
            bestChunk = chunk;
            matchType = index === 0 ? 'exact' : 'alias';
          }
        }
      });
    });

    if (!bestChunk) {
      const semantic = semanticCandidates.find((candidate) => normalizeAtsText(candidate.requirement) === normalizeAtsText(requirement.label));
      const quote = normalizeAtsText(semantic?.evidence);
      const verifiedQuote = quote.length >= 12 && allResumeText.includes(quote);
      if (semantic && verifiedQuote) {
        const confidence = Math.max(0.6, Math.min(0.85, Number(semantic.confidence) || 0.6));
        bestChunk = chunks.find((chunk) => normalizeAtsText(chunk.text).includes(quote));
        matchConfidence = confidence;
        matchType = 'semantic';
      }
    }

    return {
      label: requirement.label,
      priority: requirement.priority,
      category: requirement.category,
      matched: matchConfidence > 0,
      matchType,
      matchConfidence: Math.round(matchConfidence * 100),
      evidenceStrength: Math.round((bestChunk?.strength ?? 0) * 100),
      evidenceSection: bestChunk?.section ?? null,
      evidence: bestChunk?.text ?? null,
      weight: priorityWeight[requirement.priority],
    };
  });

  const weightedAverage = (selector: (item: typeof requirementResults[number]) => number, filter?: (item: typeof requirementResults[number]) => boolean) => {
    const rows = filter ? requirementResults.filter(filter) : requirementResults;
    const totalWeight = rows.reduce((sum, item) => sum + item.weight, 0);
    return totalWeight ? rows.reduce((sum, item) => sum + selector(item) * item.weight, 0) / totalWeight : 0;
  };
  const requirementCoverage = weightedAverage((item) => item.matchConfidence);
  const evidenceStrength = weightedAverage((item) => item.matched ? item.evidenceStrength : 0);
  const semanticRelevance = usedAi ? weightedAverage((item) => item.matchConfidence) : 0;
  const experienceAlignment = weightedAverage(
    (item) => item.evidenceSection === 'experience' || item.evidenceSection === 'projects' ? item.matchConfidence : 0,
    (item) => ['experience', 'responsibility', 'domain'].includes(item.category),
  );

  const bullets = asObjects(content.experience).flatMap((row) => asStrings(row.bullets));
  // Keep the quality check broad enough to recognise legitimate resume verbs.
  // A narrow allow-list made strong bullets such as "Collaborated..." and
  // "Maintained..." score like passive prose, so one-click optimisation could
  // clean the document without moving the score at all.
  const actionVerb = /^(achieved|administered|analysed|analyzed|architected|automated|built|collaborated|configured|coordinated|created|debugged|delivered|deployed|designed|developed|directed|documented|enhanced|established|executed|facilitated|implemented|improved|increased|integrated|launched|led|maintained|managed|mentored|migrated|monitored|operated|optimized|orchestrated|performed|planned|produced|refactored|reduced|resolved|reviewed|scaled|secured|streamlined|supported|tested|trained|troubleshot|updated)\b/i;
  const qualityPoints = bullets.length
    ? bullets.reduce((sum, bullet) => sum + (actionVerb.test(bullet.trim()) ? 0.45 : 0.15) + (/\b\d+(?:\.\d+)?%?\b/.test(bullet) ? 0.3 : 0) + (bullet.split(/\s+/).length >= 8 ? 0.25 : 0.1), 0) / bullets.length
    : 0;
  const contentQuality = Math.min(100, qualityPoints * 100);

  const personal = asObject(content.personalInfo);
  const completenessChecks = [
    Boolean(firstNonEmpty(personal.firstName, personal.lastName)),
    Boolean(firstNonEmpty(personal.email)),
    Boolean(firstNonEmpty(content.summary, content.bio)),
    asObjects(content.experience).length > 0,
    asObjects(content.education).length > 0,
    asStrings(content.skills).length > 0,
  ];
  const completeness = completenessChecks.filter(Boolean).length / completenessChecks.length * 100;

  let parsingSafety = 100;
  const templateSource = `${resume.template?.htmlLayout ?? ''} ${resume.template?.cssStyles ?? ''}`;
  if (/<table\b/i.test(templateSource)) parsingSafety -= 12;
  if (/position\s*:\s*absolute/i.test(templateSource)) parsingSafety -= 8;
  if (!firstNonEmpty(personal.email)) parsingSafety -= 15;
  if (!asObjects(content.experience).length) parsingSafety -= 10;
  parsingSafety = Math.max(0, parsingSafety);

  const breakdown = {
    requirementCoverage: Math.round(requirementCoverage),
    evidenceStrength: Math.round(evidenceStrength),
    semanticRelevance: Math.round(semanticRelevance),
    experienceAlignment: Math.round(experienceAlignment),
    contentQuality: Math.round(contentQuality),
    parsingSafety: Math.round(parsingSafety),
    completeness: Math.round(completeness),
  };
  const atsScore = Math.round(
    breakdown.requirementCoverage * 0.30
    + breakdown.evidenceStrength * 0.25
    + breakdown.semanticRelevance * 0.15
    + breakdown.experienceAlignment * 0.10
    + breakdown.contentQuality * 0.10
    + breakdown.parsingSafety * 0.05
    + breakdown.completeness * 0.05,
  );
  const confidence = usedAi
    ? (finalRequirements.length >= 8 && allResumeText.split(' ').length >= 120 ? 'HIGH' : finalRequirements.length >= 4 ? 'MEDIUM' : 'LOW')
    : 'LOW';
  const fallbackSuggestions = requirementResults
    .filter((item) => !item.matched)
    .slice(0, 6)
    .map((item) => ({
      section: item.category === 'skill' || item.category === 'tool' ? 'Skills' : 'Experience',
      issue: `No verified evidence found for “${item.label}”.`,
      suggestion: 'Add this only if it is true, and support it with a concrete experience or project example.',
    }));
  const atsData = {
    atsScore,
    confidence,
    breakdown,
    requirements: requirementResults.map(({ weight: _weight, ...item }) => item),
    matchedKeywords: requirementResults.filter((item) => item.matched).map((item) => item.label),
    missingKeywords: requirementResults.filter((item) => !item.matched).map((item) => item.label),
    suggestions: usedAi && Array.isArray(aiData.suggestions) ? aiData.suggestions.slice(0, 10) : fallbackSuggestions,
    methodologyVersion: 'hybrid-v1',
    analysisMode: usedAi ? 'FULL_HYBRID' : 'DETERMINISTIC_FALLBACK',
    sourceHash,
  };

  const updated = await prisma.resume.update({
    where: { id: resumeId },
    data: {
      atsScore,
      jobDescription: data.jobDescription,
      aiSuggestions: atsData as object,
    },
    include: { template: true },
  });

  if (usedAi && limits) {
    await prisma.userLimit.update({ where: { userId }, data: { apiUsed: { increment: 1 } } });
    await recordAiUsage(userId, 'ats_analysis');
  }

  return { resume: updated, atsData };
};

// ─── One-click ATS optimization ─────────────────────

export const optimizeForAts = async (userId: string, resumeId: string) => {
  const resume = await prisma.resume.findFirst({
    where: { id: resumeId, userId },
    include: { template: true },
  });
  if (!resume) throw new AppError(status.NOT_FOUND, 'Resume not found.');
  if (!resume.jobDescription || resume.jobDescription.trim().length < 10) {
    throw new AppError(status.BAD_REQUEST, 'Add a target job description before optimizing for ATS.');
  }

  const content = asObject(resume.contentData);
  const jobText = normalizeAtsText(resume.jobDescription);
  const skills = asStrings(content.skills);
  const prioritizedSkills = [...skills].sort((a, b) => {
    const aMatch = jobText.includes(normalizeAtsText(a)) ? 1 : 0;
    const bMatch = jobText.includes(normalizeAtsText(b)) ? 1 : 0;
    return bMatch - aMatch;
  });
  const cleanText = (value: unknown) => stringValue(value).replace(/\s+/g, ' ').trim();
  const cleanBullet = (value: string) => cleanText(value.replace(/^[\s•·▪◦*-]+/, ''));
  const experience = asObjects(content.experience).map((row) => ({
    ...row,
    bullets: asStrings(row.bullets).map(cleanBullet).filter(Boolean),
  }));
  const education = asObjects(content.education).map((row) => ({
    ...row,
    ...(row.description !== undefined ? { description: cleanText(row.description) } : {}),
  }));
  const optimizedContent: JsonObject = {
    ...content,
    ...(content.summary !== undefined ? { summary: cleanText(content.summary) } : {}),
    skills: prioritizedSkills,
    experience,
    education,
  };

  const atsTemplate = await prisma.resumeTemplate.findFirst({
    where: {
      category: 'ATS',
      documentType: resume.type,
      isActive: true,
      reviewStatus: 'APPROVED',
    },
    orderBy: [{ isDefault: 'desc' }, { isFeatured: 'desc' }, { displayOrder: 'asc' }],
  });
  const changes: string[] = [];
  if (JSON.stringify(skills) !== JSON.stringify(prioritizedSkills)) changes.push('Prioritized job-relevant skills');
  if (JSON.stringify(content.experience) !== JSON.stringify(experience)) changes.push('Normalized experience bullets for parser readability');
  if (JSON.stringify(content.education) !== JSON.stringify(education)) changes.push('Normalized education descriptions');
  if (atsTemplate && atsTemplate.id !== resume.templateId) changes.push(`Applied ATS-safe ${atsTemplate.name} template`);
  if (!changes.length) changes.push('Validated existing ATS-friendly structure');

  await prisma.$transaction([
    prisma.resumeHistory.create({
      data: {
        resumeId,
        version: resume.version,
        snapshot: resume.contentData as object,
        changedBy: userId,
      },
    }),
    prisma.resume.update({
      where: { id: resumeId },
      data: {
        contentData: optimizedContent as Prisma.InputJsonValue,
        ...(atsTemplate ? { templateId: atsTemplate.id } : {}),
        version: { increment: 1 },
      },
    }),
  ]);

  const analysis = await runAtsCheck(userId, resumeId, { jobDescription: resume.jobDescription });
  return {
    ...analysis,
    changes,
    beforeScore: resume.atsScore,
    afterScore: analysis.atsData.atsScore,
  };
};

// ─── Export PDF ───────────────────────────────────────

export const exportPdf = async (userId: string, resumeId: string, format: 'A4' | 'Letter' = 'A4') => {
  const resume = await prisma.resume.findFirst({
    where: { id: resumeId, userId },
    include: { template: true },
  });
  if (!resume) throw new AppError(status.NOT_FOUND, 'Resume not found.');

  const fullHtml = renderTemplateHtml(resume.contentData, resume.template, format);

  // The selected variable template is the only visual source of truth. Never
  // silently substitute a generic PDF layout: that makes preview and export
  // disagree and can change colours, spacing and pagination.
  let pdfBuffer: Buffer;
  if (envVars.NODE_ENV === 'production') {
    try {
      const puppeteerUrl = envVars.PUPPETEER_SERVICE_URL;
      const response = await fetch(`${puppeteerUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: fullHtml, options: { format } }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Renderer returned ${response.status}`);
      pdfBuffer = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      console.warn('[Resume export] Remote browser renderer unavailable; trying local Chromium.', error);
      try {
        pdfBuffer = await renderPdfWithLocalBrowser(fullHtml, format);
      } catch (localError) {
        console.error('[Resume export] Canonical browser renderer unavailable.', localError);
        throw new AppError(status.SERVICE_UNAVAILABLE, 'The document renderer is temporarily unavailable. Your resume was not changed.');
      }
    }
  } else {
    try {
      pdfBuffer = await renderPdfWithLocalBrowser(fullHtml, format);
    } catch (error) {
      console.error('[Resume export] Canonical browser renderer unavailable.', error);
      throw new AppError(status.SERVICE_UNAVAILABLE, 'The document renderer is temporarily unavailable. Your resume was not changed.');
    }
  }

  // Persist when object storage is available, but always return the generated
  // bytes as a fallback so exports also work in local/self-hosted setups.
  const objectName = `resumes/${userId}/${resumeId}/resume.pdf`;
  let presignedUrl: string | undefined;
  if (envVars.NODE_ENV === 'production') {
    try {
      await uploadBuffer(objectName, pdfBuffer, 'application/pdf');
      presignedUrl = await getPresignedUrl(objectName, 3600); // 1 hour
    } catch (error) {
      console.warn('[Resume export] PDF object storage unavailable; returning inline download.', error);
    }
  }

  await prisma.resume.update({
    where: { id: resumeId },
    data: {
      ...(presignedUrl ? { pdfUrl: objectName } : {}),
      status: 'EXPORTED',
    },
  });

  return {
    presignedUrl,
    base64: pdfBuffer.toString('base64'),
    fileName: `${resume.title}.pdf`,
    contentType: 'application/pdf',
    format: 'PDF' as const,
  };
};

export const exportDocx = async (userId: string, resumeId: string) => {
  const resume = await prisma.resume.findFirst({
    where: { id: resumeId, userId },
    include: { template: true },
  });
  if (!resume) throw new AppError(status.NOT_FOUND, 'Resume not found.');

  const fullHtml = renderTemplateHtml(resume.contentData, resume.template);
  let docxBuffer: Buffer;
  try {
    const pages = await renderTemplatePngPages(fullHtml, 'A4');
    docxBuffer = await buildTemplateSnapshotDocx(
      pages,
      resume.title,
      resume.template.name,
      'A4',
    );
  } catch (error) {
    console.error('[Resume export] Canonical DOCX renderer unavailable.', error);
    throw new AppError(status.SERVICE_UNAVAILABLE, 'The Word document renderer is temporarily unavailable. Your resume was not changed.');
  }
  const objectName = `resumes/${userId}/${resumeId}/resume.docx`;
  const contentType =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  let presignedUrl: string | undefined;
  if (envVars.NODE_ENV === 'production') {
    try {
      await uploadBuffer(objectName, docxBuffer, contentType);
      presignedUrl = await getPresignedUrl(objectName, 3600);
    } catch (error) {
      console.warn('[Resume export] DOCX object storage unavailable; returning inline download.', error);
    }
  }

  await prisma.resume.update({
    where: { id: resumeId },
    data: { status: 'EXPORTED' },
  });

  return {
    presignedUrl,
    base64: docxBuffer.toString('base64'),
    fileName: `${resume.title}.docx`,
    contentType,
    format: 'DOCX' as const,
  };
};

export const exportResume = async (
  userId: string,
  resumeId: string,
  fileType: 'PDF' | 'DOCX' = 'PDF',
  pageSize: 'A4' | 'Letter' = 'A4',
) =>
  fileType === 'DOCX'
    ? exportDocx(userId, resumeId)
    : exportPdf(userId, resumeId, pageSize);

// ─── Get History ──────────────────────────────────────

export const getResumeHistory = async (userId: string, resumeId: string) => {
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume) throw new AppError(status.NOT_FOUND, 'Resume not found.');
  return prisma.resumeHistory.findMany({ where: { resumeId }, orderBy: { createdAt: 'desc' } });
};

// ─── Restore Version ──────────────────────────────────

export const restoreVersion = async (userId: string, resumeId: string, version: number) => {
  const historyEntry = await prisma.resumeHistory.findFirst({
    where: { resumeId, version },
  });
  if (!historyEntry) throw new AppError(status.NOT_FOUND, 'Version not found.');

  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume) throw new AppError(status.NOT_FOUND, 'Resume not found.');

  // Save current state to history
  await prisma.resumeHistory.create({
    data: { resumeId, version: resume.version, snapshot: resume.contentData as object, changedBy: userId },
  });

  return prisma.resume.update({
    where: { id: resumeId },
    data: { contentData: historyEntry.snapshot as object, version: resume.version + 1 },
    include: { template: true },
  });
};

// ─── Duplicate Resume ─────────────────────────────────

export const duplicateResume = async (userId: string, resumeId: string) => {
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume) throw new AppError(status.NOT_FOUND, 'Resume not found.');

  const limits = await prisma.userLimit.findUnique({ where: { userId } });
  if (limits && limits.resumeUsed >= limits.resumeLimit) {
    throw new AppError(status.FORBIDDEN, 'Resume limit reached.', 'RESUME_LIMIT_REACHED');
  }

  const duplicate = await prisma.resume.create({
    data: {
      userId,
      templateId: resume.templateId,
      title: `${resume.title} (Copy)`,
      type: resume.type,
      status: 'DRAFT',
      targetJobTitle: resume.targetJobTitle,
      contentData: resume.contentData as object,
      version: 1,
    },
    include: { template: true },
  });

  await prisma.userLimit.update({ where: { userId }, data: { resumeUsed: { increment: 1 } } });
  return duplicate;
};

// ─── AI Modify Section ────────────────────────────────

export const aiModifySection = async (userId: string, resumeId: string, data: AiModifyInput) => {
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume) throw new AppError(status.NOT_FOUND, 'Resume not found.');

  const limits = await prisma.userLimit.findUnique({ where: { userId } });
  if (!limits || limits.apiUsed >= limits.apiLimit) {
    throw new AppError(status.FORBIDDEN, 'API call limit reached.', 'API_LIMIT_REACHED');
  }

  const contentData = resume.contentData as Record<string, unknown>;
  const currentSection = contentData[data.section];
  const sectionItems = Array.isArray(currentSection) ? currentSection : null;
  if (data.itemIndex !== undefined && (!sectionItems || data.itemIndex >= sectionItems.length)) {
    throw new AppError(status.BAD_REQUEST, 'The selected resume item no longer exists.');
  }
  const sectionContent = data.itemIndex === undefined
    ? currentSection
    : sectionItems?.[data.itemIndex];

  const aiResult = await getAiResponse<{ updatedSection: unknown }>({
    context: `You are improving one part of a ${resume.type.toLowerCase()} for ${resume.targetJobTitle || 'the target role'}.
Section: ${data.section}
Current content: ${JSON.stringify(sectionContent)}
Job description: ${resume.jobDescription || 'Not supplied'}
Instruction: ${data.instruction}

Preserve all factual names, employers, schools, dates, credentials, and contact details. Improve wording, clarity, impact, and relevance only. Return the same JSON data type and shape as the current content.`,
    responseStyle: 'Return exactly one JSON object: { "updatedSection": <rewritten value with the same JSON type and structure as Current content> }',
    responseTime: 20_000,
    retryNumber: 1,
    maxModels: 4,
  });

  if (!aiResult.success || !aiResult.data || !('updatedSection' in aiResult.data)) {
    throw new AppError(status.BAD_GATEWAY, 'AI writing is temporarily unavailable. Please try again.');
  }

  let updatedSection = aiResult.data.updatedSection;
  if (data.itemIndex !== undefined && sectionItems) {
    const nextItems = [...sectionItems];
    nextItems[data.itemIndex] = updatedSection;
    updatedSection = nextItems;
  }
  const newContentData: Prisma.InputJsonValue = {
    ...contentData,
    [data.section]: updatedSection,
  } as unknown as Prisma.InputJsonValue;

  const updated = await prisma.resume.update({
    where: { id: resumeId },
    data: { contentData: newContentData },
    include: { template: true },
  });

  await prisma.userLimit.update({ where: { userId }, data: { apiUsed: { increment: 1 } } });
  await recordAiUsage(userId, 'resume_section_rewrite');
  return updated;
};

export const updateResumeTemplate = async (
  userId: string,
  resumeId: string,
  data: UpdateResumeTemplateInput,
) => {
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume) throw new AppError(status.NOT_FOUND, 'Resume not found.');

  const template = await prisma.resumeTemplate.findFirst({
    where: {
      id: data.templateId,
      isActive: true,
      OR: [{ reviewStatus: 'APPROVED' }, { ownerId: userId }],
    },
  });
  if (!template) throw new AppError(status.NOT_FOUND, 'Template is not available.');

  return prisma.resume.update({
    where: { id: resumeId },
    data: {
      templateId: template.id,
      type: template.documentType,
      version: { increment: 1 },
    },
    include: { template: true },
  });
};

const newPublicSlug = () => randomBytes(18).toString('base64url');

export const shareResume = async (
  userId: string,
  resumeId: string,
  data: ShareResumeInput,
) => {
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume) throw new AppError(status.NOT_FOUND, 'Resume not found.');
  if (data.enabled && resume.disabledByAdmin) {
    throw new AppError(status.FORBIDDEN, 'This resume cannot be shared.');
  }

  let slug = resume.slug;
  if (data.enabled && !slug) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = newPublicSlug();
      const existing = await prisma.resume.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!existing) {
        slug = candidate;
        break;
      }
    }
    if (!slug) throw new AppError(status.INTERNAL_SERVER_ERROR, 'Could not create a public link.');
  }

  return prisma.resume.update({
    where: { id: resumeId },
    data: { isPublic: data.enabled, slug },
    include: { template: true },
  });
};

export const getResumeAnalytics = async (userId: string, resumeId: string) => {
  const resume = await prisma.resume.findFirst({
    where: { id: resumeId, userId },
    select: { id: true },
  });
  if (!resume) throw new AppError(status.NOT_FOUND, 'Resume not found.');

  const counts = await prisma.resumeView.groupBy({
    by: ['eventType'],
    where: { resumeId },
    _count: { _all: true },
  });
  const totalViews = counts.find((entry) => entry.eventType === 'view')?._count._all ?? 0;
  const totalDownloads = counts.find((entry) => entry.eventType === 'download')?._count._all ?? 0;

  return { totalViews, totalDownloads };
};
