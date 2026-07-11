import status from 'http-status';
import Handlebars from 'handlebars';
import { Prisma } from '../../../prisma/generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { getAiResponse } from '../../utils/aiResponse';
import { uploadBuffer, getPresignedUrl } from '../../lib/minio';
import { envVars } from '../../config/env';
import AppError from '../../errorHelpers/AppError';
import { GenerateResumeInput, UpdateResumeInput, AtsCheckInput, AiModifyInput } from './resume.schema';
import { buildResumeDocx, buildResumePdf } from './resumeDocument';

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

  const experience = profileExperience.map((source, index) => {
    const enhanced = aiExperience[index] ?? {};
    const sourceDescription = firstNonEmpty(source.desc, source.description);
    const enhancedBullets = asStrings(enhanced.bullets);
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

  return {
    ...ai,
    summary,
    experience,
    education,
    skills,
    languages: asStrings(profile.languages),
    certifications,
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

// ─── AI Resume Generation Prompt ─────────────────────

const buildResumePrompt = (profile: Record<string, unknown>, input: GenerateResumeInput): string => {
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
`;
};

const buildAtsPrompt = (contentData: Record<string, unknown>, jobDescription: string): string => {
  return `
Analyze this resume against the job description and provide an ATS optimization score.

== RESUME CONTENT ==
${JSON.stringify(contentData, null, 2)}

== JOB DESCRIPTION ==
${jobDescription}

Return a JSON with this exact structure:
{
  "atsScore": <number 0-100>,
  "matchedKeywords": [<string>],
  "missingKeywords": [<string>],
  "suggestions": [
    { "section": "<section name>", "issue": "<issue>", "suggestion": "<improved text>" }
  ]
}
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
      include: { template: { select: { name: true, category: true } } },
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
  const template = await prisma.resumeTemplate.findUnique({ where: { id: input.templateId } });
  if (!template) throw new AppError(status.NOT_FOUND, 'Template not found.');

  const profileData = {
    ...profile,
    email: (await prisma.user.findUnique({ where: { id: userId }, select: { email: true } }))?.email,
  };

  const prompt = buildResumePrompt(profileData as Record<string, unknown>, input);

  const aiResult = await getAiResponse<Record<string, unknown>>({
    context: prompt,
    responseStyle: `Return a JSON object representing a complete resume with these sections:
{
  "summary": "Professional summary text",
  "experience": [{ "company": "", "role": "", "from": "", "to": "", "current": false, "bullets": [""] }],
  "education": [{ "school": "", "degree": "", "field": "", "from": "", "to": "", "gpa": "" }],
  "skills": [""],
  "languages": [""],
  "certifications": [{ "name": "", "issuer": "", "year": "" }],
  "personalInfo": { "firstName": "", "lastName": "", "email": "", "phone": "", "location": "", "headline": "", "website": "", "linkedIn": "", "github": "" }
}`,
    responseTime: 30000,
    retryNumber: 3,
  });

  if (!aiResult.success || !aiResult.data) {
    throw new AppError(status.INTERNAL_SERVER_ERROR, 'AI generation failed. Please try again.');
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
    type: input.type as any,
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
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume) throw new AppError(status.NOT_FOUND, 'Resume not found.');

  const limits = await prisma.userLimit.findUnique({ where: { userId } });
  if (!limits || limits.apiUsed >= limits.apiLimit) {
    throw new AppError(status.FORBIDDEN, 'API call limit reached.', 'API_LIMIT_REACHED');
  }

  const prompt = buildAtsPrompt(resume.contentData as Record<string, unknown>, data.jobDescription);

  const aiResult = await getAiResponse<{
    atsScore: number;
    matchedKeywords: string[];
    missingKeywords: string[];
    suggestions: Array<{ section: string; issue: string; suggestion: string }>;
  }>({
    context: prompt,
    responseStyle: 'Return JSON with atsScore, matchedKeywords, missingKeywords, suggestions',
    responseTime: 20000,
    retryNumber: 3,
  });

  if (!aiResult.success || !aiResult.data) {
    throw new AppError(status.INTERNAL_SERVER_ERROR, 'ATS analysis failed. Please try again.');
  }

  const updated = await prisma.resume.update({
    where: { id: resumeId },
    data: {
      atsScore: aiResult.data.atsScore,
      jobDescription: data.jobDescription,
      aiSuggestions: aiResult.data as object,
    },
    include: { template: true },
  });

  await prisma.userLimit.update({ where: { userId }, data: { apiUsed: { increment: 1 } } });

  return { resume: updated, atsData: aiResult.data };
};

// ─── Export PDF ───────────────────────────────────────

export const exportPdf = async (userId: string, resumeId: string, format: 'A4' | 'Letter' = 'A4') => {
  const resume = await prisma.resume.findFirst({
    where: { id: resumeId, userId },
    include: { template: true },
  });
  if (!resume) throw new AppError(status.NOT_FOUND, 'Resume not found.');

  // Render HTML using Handlebars
  const template = Handlebars.compile(resume.template.htmlLayout);
  const renderedHtml = template({
    ...toTemplateContext(resume.contentData),
    cssStyles: resume.template.cssStyles,
  });

  const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${resume.template.cssStyles}</style></head><body>${renderedHtml}</body></html>`;

  // Production uses the browser renderer for pixel-perfect HTML/CSS output.
  // Local/self-hosted environments get a template-aware PDFKit fallback, so
  // PDF export never depends on a second service being online.
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
      console.warn('[Resume export] Browser PDF renderer unavailable; using PDFKit.', error);
      pdfBuffer = await buildResumePdf(
        asObject(resume.contentData),
        resume.template,
        resume.title,
        format,
      );
    }
  } else {
    pdfBuffer = await buildResumePdf(
      asObject(resume.contentData),
      resume.template,
      resume.title,
      format,
    );
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

  const docxBuffer = await buildResumeDocx(
    asObject(resume.contentData),
    resume.template,
    resume.title,
  );
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
  const sectionContent = contentData[data.section];

  const aiResult = await getAiResponse<{ updatedSection: unknown }>({
    context: `Section: ${data.section}\nCurrent content: ${JSON.stringify(sectionContent)}\nInstruction: ${data.instruction}`,
    responseStyle: 'Return JSON: { "updatedSection": <the rewritten section content maintaining the same data structure> }',
    responseTime: 15000,
    retryNumber: 2,
  });

  if (!aiResult.success || !aiResult.data) {
    throw new AppError(status.INTERNAL_SERVER_ERROR, 'AI modification failed.');
  }

  const newContentData: Prisma.InputJsonValue = { ...contentData, [data.section]: aiResult.data.updatedSection } as unknown as Prisma.InputJsonValue;

  const updated = await prisma.resume.update({
    where: { id: resumeId },
    data: { contentData: newContentData },
    include: { template: true },
  });

  await prisma.userLimit.update({ where: { userId }, data: { apiUsed: { increment: 1 } } });
  return updated;
};
