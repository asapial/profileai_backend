import { Router } from 'express';
import { authRouter } from './modules/auth/auth.router';

const router = Router();

// ─── Module Routers ───────────────────────────────────
router.use('/auth', authRouter);

export const indexRouter = router;