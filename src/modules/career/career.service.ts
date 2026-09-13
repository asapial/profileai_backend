import { z } from 'zod';
import { Prisma } from '../../../prisma/generated/prisma/client';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';
import { analyzeAlignment, composeStory, composeDraft, digest, ENTITLEMENTS, SCORING_VERSION, trustedEvidence } from './career.logic';
import { draftBody, editDraftBody, evidenceBody } from './career.schema';
import { jobFreshness } from '../job/job.identity';

export const ownerLock = (tx: Prisma.TransactionClient, userId: string) => tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))::text`;
export async function checkApplicationQuota(tx: Prisma.TransactionClient, userId: string) {
  await ownerLock(tx, userId);
  const subscription = await tx.subscription.findFirst({ where: { userId, status: 'ACTIVE', currentPeriodEnd: { gt: new Date() }, plan: { slug: { in: ['pro', 'career-plus', 'business'] } } } });
  if (!subscription && await tx.jobApplication.count({ where: { userId } }) >= 15) throw new AppError(429, 'Free plans include 15 saved applications.');
}
export async function entitlements(userId: string, db = prisma) {
  const subscription = await db.subscription.findFirst({ where: { userId, status: 'ACTIVE', currentPeriodEnd: { gt: new Date() } }, include: { plan: true }, orderBy: { currentPeriodEnd: 'desc' } });
  const slug = subscription?.plan.slug;
  const plan = slug === 'career-plus' || slug === 'business' ? 'career-plus' : slug === 'pro' ? 'pro' : 'free';
  return { plan, limits: ENTITLEMENTS[plan] };
}
export async function charge(tx: Prisma.TransactionClient, userId: string, feature: 'alignment' | 'draft' | 'tailor' | 'recommendations' | 'interview', units = 1) {
  await ownerLock(tx, userId);
  const subscription = await tx.subscription.findFirst({ where: { userId, status: 'ACTIVE', currentPeriodEnd: { gt: new Date() } }, include: { plan: true } });
  const slug = subscription?.plan.slug;
  const plan = slug === 'career-plus' || slug === 'business' ? 'career-plus' : slug === 'pro' ? 'pro' : 'free';
  const monday = new Date(); monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const period = feature === 'recommendations' ? monday.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 7);
  const row = await tx.careerUsage.upsert({ where: { userId_feature_period: { userId, feature, period } }, create: { userId, feature, period }, update: {} });
  if (row.used + units > ENTITLEMENTS[plan][feature]) throw new AppError(429, `${feature} allowance reached. Review your plan and usage.`);
  await tx.careerUsage.update({ where: { id: row.id }, data: { used: { increment: units } } });
}
export async function chargeRecommendations(userId: string, sourceId: string, externalIds: string[]) {
  const monday = new Date(); monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const period = monday.toISOString().slice(0, 10);
  const features = [...new Set(externalIds)].map(id => `recommendation_seen:${digest({ sourceId, id })}`);
  if (!features.length) return;
  await prisma.$transaction(async tx => {
    await ownerLock(tx, userId);
    const seen = await tx.careerUsage.findMany({ where: { userId, period, feature: { in: features } }, select: { feature: true } });
    const unseen = features.filter(feature => !seen.some(row => row.feature === feature));
    if (!unseen.length) return;
    await charge(tx, userId, 'recommendations', unseen.length);
    await tx.careerUsage.createMany({ data: unseen.map(feature => ({ userId, period, feature, used: 1 })) });
  }, { maxWait: 20000, timeout: 20000 });
}
export async function overview(userId: string) {
  const monday = new Date(); monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const [evidence, documents, jobs, resumes, usage, plan, preference, applications] = await Promise.all([
    prisma.careerEvidence.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 200 }),
    prisma.careerDocument.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 100 }),
    prisma.job.findMany({ where: { userId }, select: { id: true, title: true, company: true }, take: 100 }),
    prisma.resume.findMany({ where: { userId }, select: { id: true, title: true, version: true }, take: 100 }),
    prisma.careerUsage.findMany({ where: { userId, OR: [{ period: new Date().toISOString().slice(0, 7), feature: { in: ["alignment", "draft", "tailor", "interview"] } }, { period: monday.toISOString().slice(0, 10), feature: "recommendations" }] } }),
    entitlements(userId), prisma.careerPreference.findUnique({ where: { userId } }),
    prisma.jobApplication.findMany({ where: { userId }, select: { status: true, resumeId: true, company: true, role: true, jobId: true } }),
  ]);
  const outcomes = Object.fromEntries([...new Set(applications.map(a => a.status))].map(status => [status, applications.filter(a => a.status === status).length]));
  return { evidence, documents, jobs, resumes, usage, ...plan, preference, outcomes, cost: { model: 'deterministic', tokens: 0, providerCost: 0 }, resetAt: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString() };
}
export const saveEvidence = (userId: string, body: z.infer<typeof evidenceBody>) => prisma.careerEvidence.create({ data: { ...body, userId, details: body.details } });
export async function removeEvidence(userId: string, id: string) {
  // Claims are snapshots; deleting evidence also removes drafts and analyses containing it.
  return prisma.$transaction(async tx => {
    await ownerLock(tx, userId);
    const result = await tx.careerEvidence.deleteMany({ where: { id, userId } });
    if (!result.count) throw new AppError(404, 'Evidence not found.');
    await tx.careerAnalysis.deleteMany({ where: { userId } });
    const documents = await tx.careerDocument.findMany({ where: { userId }, select: { id: true, evidence: true } });
    const ids = documents.filter(d => JSON.stringify(d.evidence).includes(id)).map(d => d.id);
    await tx.careerDocument.deleteMany({ where: { userId, id: { in: ids } } });
    for (const draftId of ids) await tx.careerDelivery.updateMany({ where: { userId, state: 'QUEUED', payload: { path: ['draftId'], equals: draftId } }, data: { state: 'CANCELLED', payload: {} } });
    return { id };
  }, { maxWait: 20000, timeout: 20000 });
}
export async function alignment(userId: string, jobId: string, resumeId: string, documentId?: string, combined = false) {
  const [job, resume, evidence] = await Promise.all([
    prisma.job.findFirst({ where: { id: jobId, userId } }), prisma.resume.findFirst({ where: { id: resumeId, userId } }),
    prisma.careerEvidence.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
  ]);
  if (!job || !resume) throw new AppError(404, 'Job or resume not found.');
  const document = documentId ? await prisma.careerDocument.findFirst({ where: { id: documentId, userId } }) : null;
  if (documentId && !document) throw new AppError(404, 'Document not found.');
  const analysisContent = document ? combined ? { resume: resume.contentData, draft: document.body } : document.body : resume.contentData;
  const freshness = jobFreshness(job).freshness;
  const cacheKey = digest({ job: job.description, content: analysisContent, documentId, combined, version: resume.version, evidence, freshness, scoring: SCORING_VERSION });
  return prisma.$transaction(async tx => {
    await ownerLock(tx, userId);
    const existing = await tx.careerAnalysis.findUnique({ where: { userId_cacheKey: { userId, cacheKey } } });
    if (existing) return { ...existing, cached: true };
    await charge(tx, userId, 'alignment');
    const result = { ...analyzeAlignment(job.description, analysisContent, evidence, freshness, document ? combined ? "combined-input" : `draft:${document.id}` : "resume"), documentType: document ? combined ? 'COMBINED' : document.kind : 'RESUME' };
    return tx.careerAnalysis.create({ data: { userId, cacheKey, jobId, resumeId, result } });
  }, { maxWait: 20000, timeout: 20000 });
}
export async function createDraft(userId: string, body: z.infer<typeof draftBody>) {
  return prisma.$transaction(async tx => {
    await ownerLock(tx, userId);
    const job = await tx.job.findFirst({ where: { id: body.jobId, userId } });
    if (!job) throw new AppError(404, 'Job not found.');
    if (body.resumeId && !await tx.resume.findFirst({ where: { id: body.resumeId, userId } })) throw new AppError(404, 'Resume not found.');
    const evidence = await tx.careerEvidence.findMany({ where: { userId, id: { in: body.evidenceIds } } });
    if (evidence.length !== new Set(body.evidenceIds).size || evidence.some(e => !trustedEvidence(e.status))) throw new AppError(400, 'Select only confirmed evidence that you own.');
    await charge(tx, userId, 'draft');
    const draft = composeDraft({ ...body, title: job.title, company: job.company }, evidence);
    const document = await tx.careerDocument.create({ data: { userId, jobId: job.id, resumeId: body.resumeId ?? null, kind: body.kind,
      title: `${job.title} · ${body.kind}`, subject: draft.subjects[0]!, body: draft.body, evidence: draft.claims, versions: [] } });
    return { ...document, subjects: draft.subjects, missingQuestions: draft.missingQuestions };
  }, { maxWait: 20000, timeout: 20000 });
}
export async function editDraft(userId: string, id: string, body: z.infer<typeof editDraftBody>) {
  return prisma.$transaction(async tx => {
    await ownerLock(tx, userId);
    const old = await tx.careerDocument.findFirst({ where: { id, userId } });
    if (!old) throw new AppError(404, 'Draft not found.');
    const versions = [...(Array.isArray(old.versions) ? old.versions : []), { subject: old.subject, body: old.body, savedAt: old.updatedAt.toISOString() }].slice(-30);
    return tx.careerDocument.update({ where: { id }, data: { subject: body.subject, body: body.body, recipient: body.recipient ?? null,
      reviewedAt: body.reviewed ? new Date() : null, versions } });
  }, { maxWait: 20000, timeout: 20000 });
}
export async function tailor(userId: string, resumeId: string, jobId: string, evidenceIds: string[], accept: boolean, expectedPreviewKey?: string) {
  return prisma.$transaction(async tx => {
    await ownerLock(tx, userId);
    const resume = await tx.resume.findFirst({ where: { userId, id: resumeId } });
    const job = await tx.job.findFirst({ where: { userId, id: jobId } });
    const evidence = await tx.careerEvidence.findMany({ where: { userId, id: { in: evidenceIds } }, orderBy: { id: "asc" } });
    if (!resume || !job) throw new AppError(404, 'Resume or job not found.');
    if (evidence.length !== new Set(evidenceIds).size || evidence.some(e => !trustedEvidence(e.status))) throw new AppError(400, 'Only confirmed evidence can be used.');
    const content = resume.contentData;
    if (!content || typeof content !== 'object' || Array.isArray(content)) throw new AppError(400, 'Resume content must be structured.');
    // Preserve the resume schema; the summary field is already supported by the editor/exporter.
    const after = { ...content, summary: evidence.map(e => e.statement).join(' ') };
    if (!evidence.length) throw new AppError(400, 'Select at least one confirmed achievement.');
    const previewKey = digest({ resumeId, content, version: resume.version, jobId, jobUpdatedAt: job.updatedAt, evidence });
    if (accept && expectedPreviewKey !== previewKey) throw new AppError(409, "The resume, job or evidence changed. Generate and review a fresh preview.");
    if (!accept) return { previewKey, before: content, after, evidence: evidence.map(e => ({ id: e.id, source: e.source, statement: e.statement })), version: resume.version };
    const paid = await tx.subscription.findFirst({ where: { userId, status: 'ACTIVE', currentPeriodEnd: { gt: new Date() }, plan: { slug: { in: ['pro', 'career-plus', 'business'] } } } });
    if (!paid && resume.version >= 3) throw new AppError(429, 'Free plans include three resume versions.');
    await charge(tx, userId, 'tailor');
    await tx.resumeHistory.create({ data: { resumeId, version: resume.version, snapshot: content, changedBy: userId } });
    return tx.resume.update({ where: { id: resumeId }, data: { contentData: after, version: { increment: 1 }, targetJobTitle: job.title } });
  }, { maxWait: 20000, timeout: 20000 });
}

export async function updateEvidence(userId: string, id: string, body: z.infer<typeof evidenceBody>) {
  return prisma.$transaction(async tx => {
    await ownerLock(tx, userId);
    if (!await tx.careerEvidence.findFirst({ where: { id, userId } })) throw new AppError(404, 'Evidence not found.');
    const updated = await tx.careerEvidence.update({ where: { id }, data: body });
    await tx.careerAnalysis.deleteMany({ where: { userId } });
    const drafts = await tx.careerDocument.findMany({ where: { userId }, select: { id: true, evidence: true } });
    for (const draft of drafts) {
      if (!Array.isArray(draft.evidence) || !draft.evidence.some(c => c && typeof c === 'object' && !Array.isArray(c) && c.evidenceId === id)) continue;
      await tx.careerDocument.update({ where: { id: draft.id }, data: { reviewedAt: null } });
      await tx.careerDelivery.updateMany({ where: { userId, state: 'QUEUED', payload: { path: ['draftId'], equals: draft.id } }, data: { state: 'CANCELLED', payload: {} } });
    }
    return updated;
  }, { maxWait: 20000, timeout: 20000 });
}
export async function savePreferences(userId: string, patch: Prisma.InputJsonObject) {
  return prisma.$transaction(async tx => {
    await ownerLock(tx, userId);
    const old = await tx.careerPreference.findUnique({ where: { userId } });
    const preferences = { ...(old?.preferences && typeof old.preferences === 'object' && !Array.isArray(old.preferences) ? old.preferences : {}), ...patch } as Prisma.InputJsonObject;
    return tx.careerPreference.upsert({ where: { userId }, create: { userId, preferences }, update: { preferences } });
  });
}
export async function createStory(userId: string, evidenceId: string) {
  return prisma.$transaction(async tx => {
    await ownerLock(tx, userId);
    const evidence = await tx.careerEvidence.findFirst({ where: { id: evidenceId, userId } });
    if (!evidence) throw new AppError(404, 'Evidence not found.');
    if (!trustedEvidence(evidence.status)) throw new AppError(400, 'Select confirmed evidence for your story.');
    await charge(tx, userId, 'interview');
    const story = composeStory(evidence);
    const document = await tx.careerDocument.create({ data: { userId, kind: 'INTERVIEW_STORY', title: `${story.title} · Interview story`, subject: story.title, body: story.body, evidence: story.claims, versions: [] } });
    return { ...document, sections: story.sections };
  }, { maxWait: 20000, timeout: 20000 });
}
