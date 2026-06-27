import { Router } from 'express';
import * as adminController from './admin.controller';
import { checkAuth } from '../../middleware/checkAuth';

const router = Router();

// All admin routes require ADMIN role
router.use(checkAuth('ADMIN'));

router.get('/dashboard', adminController.getDashboard);
router.get('/users', adminController.listUsers);
router.get('/users/:id', adminController.getUserById);
router.put('/users/:id/limits', adminController.updateUserLimits);
router.patch('/users/:id/status', adminController.toggleUserStatus);
router.delete('/users/:id', adminController.deleteUser);
router.get('/settings', adminController.getSettings);
router.put('/settings', adminController.updateSettings);
router.get('/analytics', adminController.getAnalytics);

export const adminRouter = router;
