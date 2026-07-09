// ─── Referral routes (U-P13) ──────────────────────────────────────────────
// All routes sit behind JWT-auth; nothing here is anonymous because the
// code always operates against the resolved caller.
// ─────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import { checkAuth } from '../../middleware/checkAuth';
import { referralController } from './referral.controller';

const router = Router();
router.use(checkAuth());

// GET /referrals/me        — overview (code + summary + recent referees)
// POST /referrals/generate-link
// GET /referrals/rewards   — paginated reward ledger
// GET /referrals/leaderboard
router.get('/me', referralController.overview);
router.post('/generate-link', referralController.generate);
router.get('/rewards', referralController.rewards);
router.get('/leaderboard', referralController.leaderboard);

export const referralRouter = router;
