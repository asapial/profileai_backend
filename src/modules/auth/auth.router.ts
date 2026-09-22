import { Router } from 'express';
import * as authController from './auth.controller';
import { validateRequest } from '../../middleware/validateRequest';
import { checkAuth } from '../../middleware/checkAuth';
import {
  registerSchema,
  verifyEmailSchema,
  loginSchema,
  twoFactorVerifySchema,
  completeDeviceRecoverySchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  resendOtpSchema,
  confirm2FASchema,
  disable2FASchema,
} from './auth.schema';

import { auth } from '../../lib/auth';
import { fromNodeHeaders } from 'better-auth/node';
import { redis } from '../../lib/redis';
import { prisma } from '../../lib/prisma';
import { finishSignIn } from './auth.service';
import { tokenUtils } from '../../utils/token';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';

const router = Router();
const entryLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 });
router.post('/google/session', entryLimit, catchAsync(async (req, res) => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers), query: { disableCookieCache: true } });
  if (!session) { res.status(401).json({ message: 'Google session expired. Please sign in again.' }); return; }
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  const google = await prisma.account.findFirst({ where: { userId: session.user.id, providerId: 'google' } });
  if (!user || !google) { res.status(401).json({ message: 'Google authentication is required.' }); return; }
  // Consume the temporary OAuth session once before issuing app credentials.
  const consumed = await prisma.session.deleteMany({ where: { id: session.session.id, expiresAt: { gt: new Date() } } });
  if (consumed.count !== 1) { res.status(401).json({ message: 'Please restart Google sign-in.' }); return; }
  const result = await finishSignIn(user, req);
  if ('accessToken' in result && result.accessToken && result.refreshToken) {
    tokenUtils.setAccessTokenCookie(res, result.accessToken);
    tokenUtils.setRefreshTokenCookie(res, result.refreshToken);
  }
  const { refreshToken: _refresh, ...data } = result as typeof result & { refreshToken?: string };
  sendResponse(res, { status: 200, success: true, message: 'Google authentication complete.', data });
}));
const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 1 } });
router.post('/avatar', entryLimit, photoUpload.single('image'), catchAsync(async (req, res) => {
  if (!process.env.IMGBB_API_KEY) { res.status(503).json({ message: 'Profile photo uploads are not configured yet.' }); return; }
  const file = req.file;
  const bytes = file?.buffer;
  const valid = bytes && ((bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) || bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || (bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP'));
  if (!file || !valid || !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) { res.status(400).json({ message: 'Choose a JPEG, PNG or WebP image under 6 MB.' }); return; }
  const body = new FormData();
  body.set('key', process.env.IMGBB_API_KEY);
  body.set('image', file.buffer.toString('base64'));
  const uploaded = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body, signal: AbortSignal.timeout(30000) });
  const payload = await uploaded.json() as { success?: boolean; data?: { url?: string } };
  if (!uploaded.ok || !payload.success || !payload.data?.url) { res.status(502).json({ message: 'Photo upload failed. Please try again.' }); return; }
  sendResponse(res, { status: 200, success: true, message: 'Photo uploaded.', data: { url: payload.data.url } });
}));

// ─── Public Routes ────────────────────────────────────
router.post('/register', entryLimit, validateRequest(registerSchema), authController.register);
router.post('/verify-email', validateRequest(verifyEmailSchema), authController.verifyEmail);
router.post('/login', validateRequest(loginSchema), authController.login);
router.post('/2fa/verify', validateRequest(twoFactorVerifySchema), authController.verifyTwoFactor);
router.post(
  '/device-recovery/complete',
  validateRequest(completeDeviceRecoverySchema),
  authController.completeDeviceRecovery
);
router.post('/forgot-password', entryLimit, validateRequest(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', validateRequest(resetPasswordSchema), authController.resetPassword);
router.post('/otp/resend', entryLimit, validateRequest(resendOtpSchema), catchAsync(async (req, res, next) => {
  if (req.body.type === 'TWO_FACTOR') {
    const challenge = req.cookies?.twoFactorChallenge;
    const id = challenge ? await redis.get(`auth:2fa:${challenge}`) : null;
    const user = id ? await prisma.user.findUnique({ where: { id } }) : null;
    if (!user || user.email !== req.body.email || !user.isActive || !user.twoFactorEnabled) {
      res.status(401).json({ message: 'Please sign in again before requesting another code.' }); return;
    }
  }
  next();
}), authController.resendOtp);

// ─── Protected Routes (requires valid JWT) ────────────
router.post('/logout', checkAuth(), authController.logout);
router.post('/2fa/enable', checkAuth(), authController.enable2FA);
router.post('/2fa/confirm', checkAuth(), validateRequest(confirm2FASchema), authController.confirm2FA);
router.post('/2fa/disable', checkAuth(), validateRequest(disable2FASchema), authController.disable2FA);

// Current authenticated user — used by public pages to render the right CTA.
router.get('/me', checkAuth(), authController.getMe);

export const authRouter = router;
