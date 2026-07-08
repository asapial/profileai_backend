import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as analyticsController from './analytics.controller';

// ─── Rate limit: 60 events / minute / IP ─────────────
// Generous for any real visitor, hostile enough to deter abuse of the
// public analytics endpoint.
const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

// Public — no auth required. Used by the landing page CTA tracker.
router.post('/events', analyticsLimiter, analyticsController.recordEvents);

export const analyticsRouter = router;