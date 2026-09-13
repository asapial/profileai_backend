import { Router, type Request } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { checkAuth } from '../../middleware/checkAuth';
import { catchAsync } from '../../utils/catchAsync';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';
import * as service from './career.service';
import { draftBody, editDraftBody, evidenceBody, preferenceBody, styleBody } from './career.schema';
import { discover, importPosting, recheckJob, sourceBody } from './career.sources';
import { calendarBody, connectGoogle, disconnectGoogle, oauthCallback, queueCalendar, queueMail } from './career.integrations';

const router = Router();
router.use((_req, res, next) => { res.setHeader("Cache-Control", "private, no-store"); next(); });
const id = (req: Request) => z.string().min(1).max(200).parse(req.params.id);
router.get('/google/callback', catchAsync(async (req, res) => {
  const query = z.object({ code: z.string().max(4000), state: z.string().length(64) }).parse(req.query);
  await oauthCallback(query.code, query.state);
  res.redirect(`${process.env.FRONTEND_URL}/dashboard/career?connected=1`);
}));
router.use(checkAuth());
router.use(rateLimit({ windowMs: 60000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false }));
const respond = (fn: (req: Request) => Promise<unknown>) => catchAsync(async (req, res) => {
  const data = await fn(req); res.json({ success: true, message: 'Career workspace updated.', data });
});
router.get('/', respond(req => service.overview(req.user.userId)));
router.post('/evidence', respond(req => service.saveEvidence(req.user.userId, evidenceBody.parse(req.body))));
router.put('/evidence/:id', respond(req => service.updateEvidence(req.user.userId, id(req), evidenceBody.parse(req.body))));
router.delete('/evidence/:id', respond(req => service.removeEvidence(req.user.userId, id(req))));
router.put('/preferences', respond(req => service.savePreferences(req.user.userId, preferenceBody.parse(req.body))));
router.put('/style', respond(req => service.savePreferences(req.user.userId, { writingStyle: styleBody.parse(req.body) })));
router.post('/stories', respond(req => service.createStory(req.user.userId, z.object({ evidenceId: z.string().min(1).max(200) }).parse(req.body).evidenceId)));
router.post('/alignment', respond(req => {
  const input = z.object({ jobId: z.string().min(1), resumeId: z.string().min(1), documentId: z.string().optional(), combined: z.boolean().default(false) }).parse(req.body);
  return service.alignment(req.user.userId, input.jobId, input.resumeId, input.documentId, input.combined);
}));
router.post('/drafts', respond(req => service.createDraft(req.user.userId, draftBody.parse(req.body))));
router.put('/drafts/:id', respond(req => service.editDraft(req.user.userId, id(req), editDraftBody.parse(req.body))));
router.delete('/drafts/:id', respond(async req => {
  return prisma.$transaction(async tx => {
    await service.ownerLock(tx, req.user.userId);
    const row = await tx.careerDocument.deleteMany({ where: { id: id(req), userId: req.user.userId } });
    if (!row.count) throw new AppError(404, 'Draft not found.');
    await tx.careerDelivery.updateMany({ where: { userId: req.user.userId, payload: { path: ['draftId'], equals: id(req) }, state: 'QUEUED' }, data: { state: 'CANCELLED', payload: {} } });
    return { deleted: true };
  });
}));
router.post('/tailor', respond(req => {
  const body = z.object({ jobId: z.string(), resumeId: z.string(), evidenceIds: z.array(z.string()).min(1).max(10), accept: z.boolean(), previewKey: z.string().length(64).optional() }).parse(req.body);
  return service.tailor(req.user.userId, body.resumeId, body.jobId, body.evidenceIds, body.accept, body.previewKey);
}));
router.get('/sources', respond(() => prisma.careerSource.findMany({ where: { enabled: true }, select: { id: true, company: true, provider: true, lastCheckedAt: true } })));
router.get('/sources/:id/jobs', respond(req => discover(id(req), req.user.userId)));
router.post('/sources/:id/import', respond(req => importPosting(req.user.userId, id(req), z.object({ externalId: z.string().max(160) }).parse(req.body).externalId)));
router.post('/jobs/:id/recheck', respond(req => recheckJob(req.user.userId, id(req))));
router.post('/jobs/:id/report', respond(async req => {
  const body = z.object({ lifecycle: z.enum(['POSSIBLY_EXPIRED', 'EXPIRED', 'REMOVED']) }).parse(req.body);
  const result = await prisma.job.updateMany({ where: { id: id(req), userId: req.user.userId }, data: { lifecycle: body.lifecycle } });
  if (!result.count) throw new AppError(404, 'Job not found.'); return { reported: true };
}));
router.get('/integrations', respond(async req => ({
  configured: Boolean(process.env.CAREER_GOOGLE_CLIENT_ID && process.env.CAREER_GOOGLE_CLIENT_SECRET && process.env.CAREER_GOOGLE_REDIRECT_URI && process.env.CAREER_TOKEN_KEY),
  connections: await prisma.careerConnection.findMany({ where: { userId: req.user.userId }, select: { id: true, provider: true, scopes: true, createdAt: true } }),
  deliveries: await prisma.careerDelivery.findMany({ where: { userId: req.user.userId }, select: { id: true, kind: true, state: true, error: true, createdAt: true }, take: 50, orderBy: { createdAt: 'desc' } }),
})));
router.post('/integrations/connect', respond(req => connectGoogle(req.user.userId, z.object({ purpose: z.enum(['mail', 'calendar']) }).parse(req.body).purpose)));
router.post('/integrations/disconnect', respond(req => disconnectGoogle(req.user.userId, z.object({ purpose: z.enum(['mail', 'calendar']) }).parse(req.body).purpose)));
router.post('/drafts/:id/send', respond(req => queueMail(req.user.userId, id(req), z.object({ key: z.uuid(), reviewed: z.literal(true) }).parse(req.body).key)));
router.post('/calendar', respond(req => queueCalendar(req.user.userId, calendarBody.parse(req.body))));
router.get('/export', respond(async req => {
  const userId = req.user.userId;
  const [profile, evidence, drafts, analyses, preference, jobs, applications, resumes, letters] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }), prisma.careerEvidence.findMany({ where: { userId } }), prisma.careerDocument.findMany({ where: { userId } }), prisma.careerAnalysis.findMany({ where: { userId } }), prisma.careerPreference.findUnique({ where: { userId } }), prisma.job.findMany({ where: { userId } }), prisma.jobApplication.findMany({ where: { userId }, include: { events: true } }), prisma.resume.findMany({ where: { userId }, include: { history: true } }), prisma.coverLetter.findMany({ where: { userId } }),
  ]);
  return { exportedAt: new Date().toISOString(), profile, evidence, drafts, analyses, preference, jobs, applications, resumes, letters };
}));
router.get('/admin/sources', checkAuth('ADMIN'), respond(() => prisma.careerSource.findMany({ orderBy: { updatedAt: 'desc' } })));
router.post('/admin/sources', checkAuth('ADMIN'), respond(async req => {
  const body = sourceBody.parse(req.body);
  if (body.enabled && !body.policy.storageAllowed) throw new AppError(400, 'Storage permission is required.');
  const saved = await prisma.careerSource.upsert({ where: { provider_board: { provider: body.provider, board: body.board } }, create: body, update: { ...body, failures: 0, nextCheckAt: null } });
  await prisma.auditLog.create({ data: { actorId: req.user.userId, action: 'CAREER_SOURCE_POLICY_UPDATED', entityType: 'CareerSource', entityId: saved.id, metadata: { provider: body.provider, board: body.board, enabled: body.enabled } } });
  return saved;
}));
export const careerRouter = router;
