import { Router, type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import AppError from '../../errorHelpers/AppError';
import { checkAuth } from '../../middleware/checkAuth';
import { catchAsync } from '../../utils/catchAsync';
import { createGmailDraft, createGoogleTracker, beginGoogleConnection, disconnectHarnessGoogle, finishGoogleConnection, syncPreferencesToDrive, uploadCareerDocumentToDrive, uploadResumePdfToDrive } from './harness.google';
import { browserPairSchema, companionReportSchema, connectGoogleSchema, harnessPreferenceSchema, runModeSchema, startRunSchema, trackerSchema } from './harness.schema';
import * as service from './harness.service';

const router = Router();
const respond = (fn: (req: Request) => Promise<unknown>) => catchAsync(async (req, res) => {
  const data = await fn(req);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ success: true, message: 'Harness workspace updated.', data });
});
const id = (req: Request) => z.string().min(1).max(200).parse(req.params.id);

router.get('/google/callback', catchAsync(async (req, res) => {
  const query = z.object({ code: z.string().max(5000), state: z.string().length(64) }).parse(req.query);
  const result = await finishGoogleConnection(query.code, query.state);
  const payload = JSON.stringify({ type: 'profileai:google-connected', email: result.email, capabilities: result.capabilities }).replace(/</g, '\\u003c');
  const origin = JSON.stringify(result.popupOrigin);
  res.status(200).type('html').setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'").send(`<!doctype html><html><head><meta charset="utf-8"><title>Google connected</title><style>body{font:16px system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#f5f7fb;color:#17202a}main{max-width:28rem;padding:2rem;text-align:center}strong{display:block;font-size:1.25rem;margin-bottom:.5rem}</style></head><body><main><strong>Google connected</strong><span>This window can close.</span></main><script>if(window.opener){window.opener.postMessage(${payload},${origin});window.close()}</script></body></html>`);
}));

async function companionAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const raw = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!raw?.startsWith('pai_')) throw new AppError(401, 'Browser companion authentication is required.');
    const companion = await service.companionFromToken(raw);
    req.user = { userId: companion.userId, role: 'USER', email: '' };
    next();
  } catch (error) { next(error); }
}

router.post('/companion/tasks/claim', companionAuth, respond(req => service.claimBrowserTask(req.user.userId)));
router.post('/companion/tasks/:id/report', companionAuth, respond(req => service.reportBrowserTask(req.user.userId, id(req), companionReportSchema.parse(req.body))));

router.use(checkAuth());
router.use(rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: 'draft-8', legacyHeaders: false }));

router.get('/', respond(req => service.overview(req.user.userId)));
router.put('/preferences', respond(req => service.savePreferences(req.user.userId, harnessPreferenceSchema.parse(req.body))));
router.post('/runs', respond(req => {
  const body = startRunSchema.parse(req.body);
  return service.startRun(req.user.userId, body.mode, { ip: req.ip, userAgent: req.get('user-agent') });
}));
router.post('/runs/:id/:action', respond(req => {
  const action = z.enum(['pause', 'resume', 'cancel', 'emergency-stop']).parse(req.params.action);
  return service.controlRun(req.user.userId, id(req), action);
}));

router.post('/google/connect', respond(req => {
  const body = connectGoogleSchema.parse(req.body);
  return beginGoogleConnection(req.user.userId, body.capabilities, body.popupOrigin);
}));
router.delete('/google', respond(req => disconnectHarnessGoogle(req.user.userId)));
router.post('/google/tracker', respond(req => createGoogleTracker(req.user.userId, trackerSchema.parse(req.body).name)));
router.post('/google/sync-preferences', respond(async req => {
  const preference = await service.savePreferences(req.user.userId, harnessPreferenceSchema.parse(req.body));
  return syncPreferencesToDrive(req.user.userId, preference.preferences, preference.version);
}));
router.post('/google/gmail-drafts/:id', respond(req => createGmailDraft(req.user.userId, id(req))));
router.post('/google/drive-documents/:id', respond(req => uploadCareerDocumentToDrive(req.user.userId, id(req))));
router.post('/google/drive-resumes/:id', respond(req => uploadResumePdfToDrive(req.user.userId, id(req))));

router.post('/browser/pair', respond(req => service.pairBrowserCompanion(req.user.userId, browserPairSchema.parse(req.body).name)));
router.delete('/browser/:id', respond(req => service.revokeBrowserCompanion(req.user.userId, id(req))));
router.post('/browser/tasks/:id/approve', respond(req => service.approveBrowserTask(req.user.userId, id(req))));

router.post('/policy/check-mode', respond(async req => ({ mode: runModeSchema.parse(req.body.mode), valid: true })));

export const harnessRouter = router;
