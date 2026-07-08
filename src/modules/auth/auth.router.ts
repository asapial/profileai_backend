import { Router } from 'express';
import * as authController from './auth.controller';
import { validateRequest } from '../../middleware/validateRequest';
import { checkAuth } from '../../middleware/checkAuth';
import {
  registerSchema,
  verifyEmailSchema,
  loginSchema,
  twoFactorVerifySchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  resendOtpSchema,
  confirm2FASchema,
  disable2FASchema,
} from './auth.schema';

const router = Router();

// ─── Public Routes ────────────────────────────────────
router.post('/register', validateRequest(registerSchema), authController.register);
router.post('/verify-email', validateRequest(verifyEmailSchema), authController.verifyEmail);
router.post('/login', validateRequest(loginSchema), authController.login);
router.post('/2fa/verify', validateRequest(twoFactorVerifySchema), authController.verifyTwoFactor);
router.post('/forgot-password', validateRequest(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', validateRequest(resetPasswordSchema), authController.resetPassword);
router.post('/otp/resend', validateRequest(resendOtpSchema), authController.resendOtp);

// ─── Protected Routes (requires valid JWT) ────────────
router.post('/logout', checkAuth(), authController.logout);
router.post('/2fa/enable', checkAuth(), authController.enable2FA);
router.post('/2fa/confirm', checkAuth(), validateRequest(confirm2FASchema), authController.confirm2FA);
router.post('/2fa/disable', checkAuth(), validateRequest(disable2FASchema), authController.disable2FA);

// Current authenticated user — used by public pages to render the right CTA.
router.get('/me', checkAuth(), authController.getMe);

export const authRouter = router;
