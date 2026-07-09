import { Router } from 'express';
import { authRouter } from './modules/auth/auth.router';
import { userRouter } from './modules/user/user.router';
import { dashboardRouter } from './modules/dashboard/dashboard.router';
import { notificationRouter } from './modules/notification/notification.router';
import { applicationRouter } from './modules/application/application.router';
import { projectRouter } from './modules/project/project.router';
import { referenceRouter } from './modules/reference/reference.router';
import { templateRouter } from './modules/template/template.router';
import { resumeRouter } from './modules/resume/resume.router';
import { exportRouter } from './modules/export/export.router';
import { adminRouter } from './modules/admin/admin.router';
import { analyticsRouter } from './modules/analytics/analytics.router';
import { publicResumeRouter } from './modules/publicResume/publicResume.router';
import { coverLetterRouter } from './modules/coverLetter/coverLetter.router';
import { toolsRouter } from './modules/tools/tools.router';
import { referralRouter } from './modules/referral/referral.router';
import { billingRouter } from './modules/billing/billing.router';

const router = Router();

// ─── Module Routers ────────────────────────────────────
router.use('/auth', authRouter);
router.use('/user', userRouter);
router.use('/user/dashboard', dashboardRouter);
router.use('/notifications', notificationRouter);
router.use('/applications', applicationRouter);
router.use('/user/projects', projectRouter);
router.use('/user/references', referenceRouter);
router.use('/templates', templateRouter);
router.use('/resumes', resumeRouter);
router.use('/', exportRouter); // /user/export + /user/export-jobs + /resumes/:id/export
router.use('/public/resumes', publicResumeRouter);
router.use('/admin', adminRouter);
router.use('/analytics', analyticsRouter);
router.use('/cover-letters', coverLetterRouter);
router.use('/tools', toolsRouter);
router.use('/referrals', referralRouter);
router.use('/billing', billingRouter);

export const indexRouter = router;