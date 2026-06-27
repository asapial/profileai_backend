import status from 'http-status';
import Handlebars from 'handlebars';
import { prisma } from '../../lib/prisma';
import { getAiResponse } from '../../utils/aiResponse';
import { uploadBuffer, getPresignedUrl } from '../../lib/minio';
import { envVars } from '../../config/env';
import AppError from '../../errorHelpers/AppError';
import { GenerateResumeInput, UpdateResumeInput, AtsCheckInput, AiModifyInput } from './resume.schema';

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

  const resume = await prisma.resume.create({
    data: {
      userId,
      templateId: input.templateId,
      title: input.title,
      type: input.type as any,
      status: 'GENERATED',
      targetJobTitle: input.targetJobTitle,
      jobDescription: input.jobDescription,
      contentData: aiResult.data,
      version: 1,
    },
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

  return { resume, template };
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

  return prisma.resume.update({
    where: { id: resumeId },
    data: {
      ...data,
      contentData: data.contentData ? data.contentData as object : existing.contentData,
      version: existing.version + 1,
    },
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
  const contentData = resume.contentData as Record<string, unknown>;
  const personalInfo = (contentData.personalInfo as Record<string, unknown>) || {};

  const renderedHtml = template({
    ...contentData,
    ...personalInfo,
    cssStyles: resume.template.cssStyles,
  });

  const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${resume.template.cssStyles}</style></head><body>${renderedHtml}</body></html>`;

  // Call Puppeteer service
  const puppeteerUrl = envVars.PUPPETEER_SERVICE_URL;
  const response = await fetch(`${puppeteerUrl}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html: fullHtml, options: { format } }),
  });

  if (!response.ok) {
    throw new AppError(status.INTERNAL_SERVER_ERROR, 'PDF generation failed.');
  }

  const pdfBuffer = Buffer.from(await response.arrayBuffer());

  // Upload to MinIO
  const objectName = `resumes/${userId}/${resumeId}/resume.pdf`;
  await uploadBuffer(objectName, pdfBuffer, 'application/pdf');
  const presignedUrl = await getPresignedUrl(objectName, 3600); // 1 hour

  await prisma.resume.update({
    where: { id: resumeId },
    data: { pdfUrl: objectName, status: 'EXPORTED' },
  });

  return { presignedUrl };
};

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

  const newContentData = { ...contentData, [data.section]: aiResult.data.updatedSection };

  const updated = await prisma.resume.update({
    where: { id: resumeId },
    data: { contentData: newContentData },
  });

  await prisma.userLimit.update({ where: { userId }, data: { apiUsed: { increment: 1 } } });
  return updated;
};
