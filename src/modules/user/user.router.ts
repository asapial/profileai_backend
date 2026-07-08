import { Router } from 'express';
import multer from 'multer';
import * as userController from './user.controller';
import { validateRequest } from '../../middleware/validateRequest';
import { checkAuth } from '../../middleware/checkAuth';
import { updateProfileSchema, changePasswordSchema } from './user.schema';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

// All user routes require authentication
router.use(checkAuth());

router.get('/profile', userController.getProfile);
router.put('/profile', validateRequest(updateProfileSchema), userController.updateProfile);
router.post('/avatar', upload.single('avatar'), userController.uploadAvatar);
router.put('/change-password', validateRequest(changePasswordSchema), userController.changePassword);
router.get('/devices', userController.getDevices);
router.delete('/devices/:id', userController.revokeDevice);
router.get('/limits', userController.getLimits);
router.get('/notification-preferences', userController.getNotificationPreferences);
router.patch('/notification-preferences', userController.updateNotificationPreferences);
router.delete('/account', userController.deleteAccount);

export const userRouter = router;
