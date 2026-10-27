import { Router } from 'express';
import multer from 'multer';
import * as userController from './user.controller';
import { validateRequest } from '../../middleware/validateRequest';
import { checkAuth } from '../../middleware/checkAuth';
import { updateProfileSchema, changePasswordSchema, updateExperiencesSchema, updateEducationsSchema, updateSkillsSchema, notificationPreferencesSchema, trustDeviceSchema } from './user.schema';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

// All user routes require authentication
router.use(checkAuth());

router.get('/profile', userController.getProfile);
router.put('/profile', validateRequest(updateProfileSchema), userController.updateProfile);
router.get('/experiences', userController.getExperiences);
router.put('/experiences', validateRequest(updateExperiencesSchema), userController.updateExperiences);
router.get('/educations', userController.getEducations);
router.put('/educations', validateRequest(updateEducationsSchema), userController.updateEducations);
router.get('/skills', userController.getSkills);
router.put('/skills', validateRequest(updateSkillsSchema), userController.updateSkills);
router.post('/avatar', upload.single('avatar'), userController.uploadAvatar);
router.put('/change-password', validateRequest(changePasswordSchema), userController.changePassword);
router.get('/devices', userController.getDevices);
router.delete('/devices/:id', userController.revokeDevice);
router.get('/sessions', userController.getSessions);
router.delete('/sessions', userController.revokeAllSessions);
router.delete('/sessions/:id', userController.revokeSession);
router.get('/login-devices', userController.getLoginDevices);
router.patch('/login-devices/:id', validateRequest(trustDeviceSchema), userController.setDeviceTrust);
router.delete('/login-devices/:id', userController.revokeDevice);
router.get('/limits', userController.getLimits);
router.get('/notification-preferences', userController.getNotificationPreferences);
router.patch('/notification-preferences', validateRequest(notificationPreferencesSchema), userController.updateNotificationPreferences);
router.delete('/account', userController.deleteAccount);

export const userRouter = router;
