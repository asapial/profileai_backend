import { Router } from 'express';
import * as adminController from './admin.controller';
import { checkAuth } from '../../middleware/checkAuth';
import * as operations from './admin.operations.controller';
import { validateRequest } from '../../middleware/validateRequest';
import { reviewUserTemplateSchema } from '../template/template.schema';

const router = Router();

// All admin routes require ADMIN role
router.use(checkAuth('ADMIN'));

router.get('/dashboard', adminController.getDashboard);
router.get('/users', adminController.listUsers);
router.post('/users/invite', adminController.inviteUser);
router.get('/users/:id', adminController.getUserById);
router.post('/users/:id/impersonate', adminController.impersonateUser);
router.delete(
  '/users/:id/sessions/:sessionId',
  adminController.revokeUserSession,
);
router.put('/users/:id/limits', adminController.updateUserLimits);
router.patch('/users/:id/status', adminController.toggleUserStatus);
router.patch('/users/:id/role', adminController.changeUserRole);
router.patch('/users/:id/verify', adminController.verifyUserEmail);
router.post('/users/:id/force-reset', adminController.forceResetUser);
router.post('/users/bulk', adminController.bulkUserAction);
router.delete('/users/:id', adminController.deleteUser);
router.get('/settings', adminController.getSettings);
router.put('/settings', adminController.updateSettings);
router.get('/analytics', adminController.getAnalytics);

router.get('/homepage', operations.getHomepage);
router.put('/homepage', operations.saveHomepage);
router.post('/homepage/publish', operations.publishHomepage);

router.get('/feature-flags', operations.listFeatureFlags);
router.post('/feature-flags', operations.createFeatureFlag);
router.patch('/feature-flags/:id', operations.updateFeatureFlag);
router.delete('/feature-flags/:id', operations.deleteFeatureFlag);

router.get('/announcements', operations.listAnnouncements);
router.post('/announcements', operations.createAnnouncement);
router.patch('/announcements/:id', operations.updateAnnouncement);
router.post('/announcements/:id/publish', operations.publishAnnouncement);
router.post('/announcements/:id/retire', operations.retireAnnouncement);

router.get('/tickets', operations.listTickets);
router.get('/tickets/:id', operations.getTicket);
router.patch('/tickets/:id', operations.updateTicket);
router.post('/tickets/:id/messages', operations.replyTicket);

router.get('/help-categories', operations.listHelpCategories);
router.get('/help-articles', operations.listHelpArticles);
router.post('/help-articles', operations.createHelpArticle);
router.get('/help-articles/:id', operations.getHelpArticle);
router.put('/help-articles/:id', operations.updateHelpArticle);
router.patch('/help-articles/:id', operations.updateHelpArticle);

router.get('/moderation', operations.listModeration);
router.post('/moderation/:id/resolve', operations.resolveModeration);

router.get('/audit-log/export', operations.exportAudit);
router.get('/audit-log', operations.listAudit);
router.get('/audit-log/:id', operations.getAudit);
router.get('/security', operations.getSecurity);

router.post('/users/:id/ban', async (req, res, next) => {
  req.body = { isActive: false };
  return adminController.toggleUserStatus(req, res, next);
});
router.post('/users/:id/unban', async (req, res, next) => {
  req.body = { isActive: true };
  return adminController.toggleUserStatus(req, res, next);
});

router.get('/plans', operations.listPlans);
router.post('/plans', operations.createPlan);
router.put('/plans/:id', operations.updatePlan);
router.delete('/plans/:id', operations.archivePlan);

router.get('/coupons', operations.listCoupons);
router.post('/coupons', operations.createCoupon);
router.patch('/coupons/:id', operations.updateCoupon);
router.post('/coupons/:id/deactivate', operations.deactivateCoupon);

router.get('/invoices/export', operations.exportInvoices);
router.get('/invoices', operations.listInvoices);
router.post('/invoices/:id/refund', operations.refundInvoice);

router.get('/profile', operations.getAdminProfile);
router.patch('/profile', operations.updateAdminProfile);
router.get('/profile/sessions', operations.listAdminSessions);
router.delete('/profile/sessions', operations.revokeAllAdminSessions);
router.delete('/profile/sessions/:id', operations.revokeAdminSession);
router.get('/profile/devices', operations.listAdminDevices);
router.post('/profile/change-password', operations.changeAdminPassword);
router.post('/profile/2fa/toggle', operations.toggleAdminTwoFactor);
router.delete('/devices/:id', operations.revokeAdminDevice);
router.patch('/devices/:id/trust', operations.trustAdminDevice);

router.get('/templates', operations.listAdminTemplates);
router.post('/templates', operations.createAdminTemplate);
router.get('/templates/:id/history', operations.getAdminTemplateHistory);
router.patch('/templates/:id/status', operations.setAdminTemplateStatus);
router.patch('/templates/:id/default', operations.setAdminTemplateDefault);
router.patch('/templates/:id/review', validateRequest(reviewUserTemplateSchema), operations.reviewAdminTemplate);
router.get('/templates/:id', operations.getAdminTemplate);
router.put('/templates/:id', operations.updateAdminTemplate);
router.delete('/templates/:id', operations.deleteAdminTemplate);

router.get('/resumes', operations.listResumes);
router.get('/exports', operations.listExports);
router.get('/reports', operations.getReports);

router.post('/settings/email/test-send', operations.testEmail);
router.get('/settings/:key', operations.getSectionSetting);
router.put('/settings/:key', operations.putSectionSetting);

export const adminRouter = router;
