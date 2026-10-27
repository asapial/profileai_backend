import { Router, type Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { checkAuth } from '../../middleware/checkAuth';
import { catchAsync } from '../../utils/catchAsync';
import { workerAccessAuth, workerSignedAuth } from './worker.auth';
import * as service from './worker.service';
import {
  workerApprovalDecisionSchema,
  workerApprovalSchema,
  workerAuthDecisionSchema,
  workerAuthPollSchema,
  workerAuthStartSchema,
  workerCaptureTaskSchema,
  workerConsentUpsertSchema,
  workerControlSchema,
  workerEventsSchema,
  workerListingBatchSchema,
  workerPairingCodeSchema,
  workerPairSchema,
  workerRefreshSchema,
  workerResultSchema,
  workerSearchTaskSchema,
  workerCheckpointSchema,
  hybridJobSearchSchema,
} from './worker.schema';
import { workerGateway } from './worker.gateway';

const router = Router();
const id = (req: Request) => z.string().min(1).max(200).parse(req.params.id);

/**
 * Local worker transport is opt-in. The desktop UI may still be distributed
 * while this is disabled, but no pairing, task, or approval route is exposed.
 */
router.use((_req, res, next) => {
  if (process.env.WORKER_ENABLED === 'true') {
    next();
    return;
  }
  res.status(404).json({
    success: false,
    message: 'The local browser worker is not enabled on this server.',
  });
});
const respond = (message: string, fn: (req: Request) => Promise<unknown>) => catchAsync(async (req, res) => {
  const data = await fn(req);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ success: true, message, data });
});

const pairLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many pairing attempts. Wait ten minutes and create a new code.' },
});
const tokenLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many token refresh attempts.' },
});
const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many browser authorization attempts. Wait a minute and try again.' },
});

// ── Public worker endpoints ────────────────────────────────────────────────
router.post('/pair', pairLimiter, respond('Worker paired.', req =>
  service.pairWorker(workerPairSchema.parse(req.body), req.ip),
));

router.post('/auth/start', authLimiter, respond('Browser authorization started.', req =>
  service.startWorkerAuth(workerAuthStartSchema.parse(req.body)),
));
router.get('/auth/requests/:id', authLimiter, respond('Authorization request loaded.', req =>
  service.getWorkerAuthRequest(id(req)),
));
router.post('/auth/poll', authLimiter, respond('Authorization request checked.', req =>
  service.completeWorkerAuth(workerAuthPollSchema.parse(req.body), req.ip),
));

router.post('/token/refresh', tokenLimiter, workerSignedAuth, respond('Worker token rotated.', req =>
  service.refreshWorkerSession(workerRefreshSchema.parse(req.body), req.worker!.deviceId),
));

// ── Authenticated worker endpoints ─────────────────────────────────────────
router.post('/heartbeat', workerAccessAuth, respond('Worker heartbeat recorded.', req =>
  service.heartbeat(req.worker!.userId, req.worker!.deviceId, req.ip),
));
router.post('/tasks/claim', workerAccessAuth, respond('Task claim evaluated.', req => {
  z.object({ deviceId: z.string().min(1).max(200) }).parse(req.body);
  return service.claimTask(req.worker!.userId, req.worker!.deviceId);
}));
router.get('/search-plan', workerAccessAuth, respond('Automatic public search plan loaded.', req =>
  service.getAutomaticSearchPlan(req.worker!.userId, req.worker!.deviceId),
));
router.get('/workspace', workerAccessAuth, respond('Worker account workspace loaded.', req =>
  service.getWorkerWorkspace(req.worker!.userId),
));
router.post('/tasks/:id/events', workerAccessAuth, respond('Worker events accepted.', req =>
  service.recordEvents(req.worker!.userId, req.worker!.deviceId, id(req), workerEventsSchema.parse(req.body).events),
));
router.post('/tasks/:id/checkpoints', workerAccessAuth, respond('Worker checkpoint stored.', req => {
  const checkpoint = workerCheckpointSchema.parse(req.body);
  if (checkpoint.taskId !== id(req)) throw new Error('Checkpoint task does not match the route.');
  return service.recordCheckpoint(req.worker!.userId, req.worker!.deviceId, checkpoint);
}));
router.post('/tasks/:id/result', workerAccessAuth, respond('Worker result recorded.', req =>
  service.reportResult(req.worker!.userId, req.worker!.deviceId, id(req), workerResultSchema.parse(req.body)),
));
router.post('/tasks/:id/approvals', workerAccessAuth, respond('Approval request queued for the account owner.', req =>
  service.requestApproval(req.worker!.userId, req.worker!.deviceId, id(req), workerApprovalSchema.parse(req.body)),
));
router.post('/listings', workerAccessAuth, respond('Captured listings stored.', req => {
  const listings = workerListingBatchSchema.parse(req.body).listings;
  return service.saveCapturedListings(req.worker!.userId, req.worker!.deviceId, listings);
}));
router.post('/search-activity', workerAccessAuth, respond('Local search activity stored.', req => {
  const event = z.object({ taskId: z.string().regex(/^local_schedule_[a-zA-Z0-9_-]+$/).max(200), seq: z.number().int().min(0), type: z.enum(['RUN_STARTED', 'JOB_CAPTURED', 'RUN_COMPLETED', 'SENSITIVE_STOP', 'ERROR', 'PROGRESS']), message: z.string().min(1).max(500), at: z.string().datetime() }).parse(req.body);
  return service.recordLocalSearchActivity(req.worker!.userId, req.worker!.deviceId, event);
}));
router.get('/approvals/pending', workerAccessAuth, respond('Device approval state loaded.', req =>
  service.listApprovalsForDevice(req.worker!.userId, req.worker!.deviceId),
));
router.post('/device/approvals/:id/decision', workerAccessAuth, respond('Approval decision recorded from the paired desktop.', async req => {
  const body = workerApprovalDecisionSchema.parse(req.body);
  const approval = await service.decideApprovalFromDevice(req.worker!.userId, req.worker!.deviceId, id(req), body.decision, body.note);
  workerGateway.sendApprovalDecision(approval.deviceId, approval.id, body.decision, 'desktop');
  return approval;
}));

// ── Web oversight endpoints ────────────────────────────────────────────────
router.use(checkAuth());
router.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));

router.get('/overview', respond('Worker workspace loaded.', req => service.overview(req.user.userId)));
router.post('/auth/requests/:id/decision', respond('Authorization decision recorded.', req => {
  const body = workerAuthDecisionSchema.parse(req.body);
  return service.decideWorkerAuth(id(req), body.decision, req.user.userId);
}));
router.get('/consents', respond('Worker permissions loaded.', req => service.listConsents(req.user.userId)));
router.put('/consents/:source', respond('Worker permission saved.', req => {
  const source = z.string().trim().min(1).max(40).parse(req.params.source).toUpperCase();
  return service.upsertConsent(req.user.userId, source, workerConsentUpsertSchema.parse(req.body ?? {}));
}));
router.post('/search-tasks', respond('Browser search queued.', req =>
  service.createSearchTask(req.user.userId, workerSearchTaskSchema.parse(req.body)),
));
router.post('/job-searches', respond('Job search started.', req =>
  service.runHybridJobSearch(req.user.userId, hybridJobSearchSchema.parse(req.body)),
));
router.post('/capture-tasks', respond('Browser capture queued.', req =>
  service.createCaptureTask(req.user.userId, workerCaptureTaskSchema.parse(req.body)),
));
router.get('/listings', respond('Captured listings loaded.', req => {
  const limit = z.coerce.number().int().min(1).max(100).default(20).parse(req.query.limit);
  return service.listCapturedListings(req.user.userId, limit);
}));
router.post('/pairing-code', respond('Pairing code created.', req => {
  const input = workerPairingCodeSchema.parse(req.body ?? {});
  return service.createPairingCode(req.user.userId, input.nameHint);
}));
router.get('/devices', respond('Worker devices loaded.', req => service.listDevices(req.user.userId)));
router.delete('/devices/:id', respond('Worker device revoked.', req => service.revokeDevice(req.user.userId, id(req))));
router.get('/approvals', respond('Worker approvals loaded.', req => {
  const state = z.string().max(30).optional().parse(req.query.state);
  return service.listApprovals(req.user.userId, state);
}));
router.post('/approvals/:id/decision', respond('Approval decision recorded.', async req => {
  const body = workerApprovalDecisionSchema.parse(req.body);
  const approval = await service.decideApproval(req.user.userId, id(req), body.decision, body.note);
  workerGateway.sendApprovalDecision(approval.deviceId, approval.id, body.decision, req.user.email || req.user.userId);
  return approval;
}));
router.post('/tasks/:id/control', respond('Worker control command queued.', async req => {
  const body = workerControlSchema.parse(req.body);
  const task = await service.controlTask(req.user.userId, id(req), body.action);
  if (task.deviceId) workerGateway.sendControl(task.deviceId, task.id, body.action);
  return task;
}));
router.get('/policies', respond('Source policies loaded.', () => service.listPolicies()));

export const workerRouter = router;
