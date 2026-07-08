import { Router } from 'express';
import { authRouter } from './modules/auth/auth.router';
import { userRouter } from './modules/user/user.router';
import { templateRouter } from './modules/template/template.router';
import { resumeRouter } from './modules/resume/resume.router';
import { adminRouter } from './modules/admin/admin.router';
import { analyticsRouter } from './modules/analytics/analytics.router';

const router = Router();

// ─── Module Routers ───────────────────────────────────
router.use('/auth', authRouter);
router.use('/user', userRouter);
router.use('/templates', templateRouter);
router.use('/resumes', resumeRouter);
router.use('/admin', adminRouter);
router.use('/analytics', analyticsRouter);

export const indexRouter = router;