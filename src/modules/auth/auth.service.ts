import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { UAParser } from 'ua-parser-js';
import status from 'http-status';
import { Request } from 'express';
import { Prisma } from '../../prisma/generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import { sendOtpEmail, sendPasswordChangedEmail, sendWelcomeEmail } from '../../lib/mailer';
import { tokenUtils } from '../../utils/token';
import AppError from '../../errorHelpers/AppError';
import { envVars } from '../../config/env';
import {
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  TwoFactorVerifyInput,
  VerifyEmailInput,
} from './auth.schema';

// ─── Constants ───────────────────────────────────────
const OTP_TTL_MINUTES = 10;
const MAX_DEVICES = 3;
const OTP_RATE_LIMIT_KEY = (email: string, type: string) =>
  `otp:rate:${type}:${email}`;
const OTP_RATE_LIMIT_MAX = 3;
const OTP_RATE_LIMIT_WINDOW = 60 * 60; // 1 hour in seconds

// Login attempt rate limit (per email+IP). Generous to prevent lockouts but
// tight enough to deter credential-stuffing and brute-force attacks.
const LOGIN_RATE_LIMIT_KEY = (email: string, ip: string) =>
  `login:rate:${email}:${ip}`;
const LOGIN_RATE_LIMIT_MAX = 10;
const LOGIN_RATE_LIMIT_WINDOW = 15 * 60; // 15 minutes in seconds

// ─── OTP Helpers ─────────────────────────────────────

const generateOtp = (): string => {
  return crypto.randomInt(100000, 999999).toString();
};

const hashOtp = async (otp: string): Promise<string> => {
  return bcrypt.hash(otp, 10);
};

const verifyOtp = async (otp: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(otp, hash);
};

const checkOtpRateLimit = async (email: string, type: string): Promise<void> => {
  const key = OTP_RATE_LIMIT_KEY(email, type);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, OTP_RATE_LIMIT_WINDOW);
  }
  if (count > OTP_RATE_LIMIT_MAX) {
    throw new AppError(
      status.TOO_MANY_REQUESTS,
      `Too many OTP requests. Please wait before requesting another OTP.`
    );
  }
};

// Increments the login-attempt counter for an (email, ip) pair. The first
// call also sets the TTL, and every subsequent call rolls the window. We
// always return the new count so callers can log / emit SecurityAlerts.
const bumpLoginRateLimit = async (
  email: string,
  ip: string
): Promise<number> => {
  const key = LOGIN_RATE_LIMIT_KEY(email, ip);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, LOGIN_RATE_LIMIT_WINDOW);
  }
  return count;
};

const assertLoginRateLimit = async (
  email: string,
  ip: string
): Promise<void> => {
  const count = await bumpLoginRateLimit(email, ip);
  if (count > LOGIN_RATE_LIMIT_MAX) {
    throw new AppError(
      status.TOO_MANY_REQUESTS,
      'Too many login attempts. Please try again in a few minutes.'
    );
  }
};

const clearLoginRateLimit = async (
  email: string,
  ip: string
): Promise<void> => {
  await redis.del(LOGIN_RATE_LIMIT_KEY(email, ip));
};

const saveOtp = async (
  userId: string,
  otp: string,
  type: 'EMAIL_VERIFY' | 'FORGET_PASSWORD' | 'RESET_PASSWORD' | 'TWO_FACTOR'
): Promise<void> => {
  // Invalidate previous OTPs of same type
  await prisma.otpCode.updateMany({
    where: { userId, type, used: false },
    data: { used: true },
  });

  const codeHash = await hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await prisma.otpCode.create({
    data: { userId, codeHash, type, expiresAt },
  });
};

const consumeOtp = async (
  userId: string,
  otp: string,
  type: 'EMAIL_VERIFY' | 'FORGET_PASSWORD' | 'RESET_PASSWORD' | 'TWO_FACTOR'
): Promise<void> => {
  const otpRecord = await prisma.otpCode.findFirst({
    where: { userId, type, used: false },
    orderBy: { createdAt: 'desc' },
  });

  if (!otpRecord) {
    throw new AppError(status.BAD_REQUEST, 'Invalid or expired OTP.');
  }
  if (new Date() > otpRecord.expiresAt) {
    throw new AppError(status.BAD_REQUEST, 'OTP has expired. Please request a new one.');
  }

  const isValid = await verifyOtp(otp, otpRecord.codeHash);
  if (!isValid) {
    throw new AppError(status.BAD_REQUEST, 'Invalid OTP. Please try again.');
  }

  await prisma.otpCode.update({
    where: { id: otpRecord.id },
    data: { used: true },
  });
};

// ─── Device Fingerprinting ───────────────────────────

const parseDevice = (userAgent: string, ipAddress: string) => {
  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  const browser = result.browser.name || 'Unknown Browser';
  const os = result.os.name || 'Unknown OS';
  const deviceType =
    result.device.type === 'mobile'
      ? 'mobile'
      : result.device.type === 'tablet'
      ? 'tablet'
      : 'desktop';
  const deviceName = `${browser} on ${os}`;

  const fingerprint = crypto
    .createHash('sha256')
    .update(`${browser}:${os}:${userAgent.substring(0, 100)}`)
    .digest('hex');

  return { browser, os, deviceType, deviceName, fingerprint, ipAddress };
};

const registerDevice = async (
  userId: string,
  userAgent: string,
  ipAddress: string
): Promise<string> => {
  const deviceInfo = parseDevice(userAgent, ipAddress);

  // Check if this device fingerprint already exists
  const existing = await prisma.loginDevice.findFirst({
    where: { userId, fingerprint: deviceInfo.fingerprint },
  });

  if (existing) {
    await prisma.loginDevice.update({
      where: { id: existing.id },
      data: { lastSeenAt: new Date(), ipAddress },
    });
    return existing.id;
  }

  // Count user's existing devices
  const deviceCount = await prisma.loginDevice.count({ where: { userId } });

  if (deviceCount >= MAX_DEVICES) {
    throw new AppError(
      status.FORBIDDEN,
      'Device limit reached. Please revoke a device from your Profile → Devices tab.',
      'DEVICE_LIMIT_REACHED'
    );
  }

  const device = await prisma.loginDevice.create({
    data: {
      userId,
      deviceName: deviceInfo.deviceName,
      deviceType: deviceInfo.deviceType,
      browser: deviceInfo.browser,
      os: deviceInfo.os,
      ipAddress: deviceInfo.ipAddress,
      userAgent,
      fingerprint: deviceInfo.fingerprint,
      isTrusted: false,
    },
  });

  return device.id;
};

// ─── Auth Services ───────────────────────────────────

export const registerUser = async (data: RegisterInput) => {
  const { firstName, lastName, email, password, referredByCode } = data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(
      status.CONFLICT,
      'An account with this email already exists.'
    );
  }

  // BetterAuth manages account creation via /api/auth routes
  // Here we use our custom flow layered on top
  const passwordHash = await bcrypt.hash(password, 12);
  const userId = crypto.randomUUID();

  // Pull default limits from PlatformConfig; fall back to safe defaults so a
  // missing config row never blocks signups.
  const [resumeLimitCfg, apiLimitCfg] = await Promise.all([
    prisma.platformConfig.findUnique({ where: { key: 'default_resume_limit' } }),
    prisma.platformConfig.findUnique({ where: { key: 'default_api_limit' } }),
  ]);
  const resumeLimit = parseInt(resumeLimitCfg?.value ?? '', 10) || 5;
  const apiLimit = parseInt(apiLimitCfg?.value ?? '', 10) || 50;

  // We create User + Account + UserProfile + UserLimit + NotificationPreference
  // in a single transaction. If any insert fails the whole registration is
  // rolled back so we never leave an orphan user with no limits or profile.
  const user = await prisma.$transaction(async (tx) => {
    return tx.user.create({
      data: {
        id: userId,
        name: `${firstName} ${lastName}`,
        email,
        emailVerified: false,
        role: 'USER',
        isActive: true,
        twoFactorEnabled: false,
        accounts: {
          create: {
            id: crypto.randomUUID(),
            accountId: userId,
            providerId: 'credential',
            password: passwordHash,
          },
        },
        profile: {
          create: {
            firstName,
            lastName,
            education: [] as unknown as Prisma.InputJsonValue,
            experience: [] as unknown as Prisma.InputJsonValue,
            skills: [],
            languages: [],
            // Persist referral code if it was supplied + validated by the
            // Zod schema. We don't burn the code here — a separate analytics
            // / referral-attribution job consumes it later.
            ...(referredByCode ? { referredByCode } : {}),
          },
        },
        limits: {
          create: {
            resumeLimit,
            apiLimit,
            resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        },
        notificationPreference: {
          create: {
            // Sensible defaults: security + product + tips on, marketing off,
            // in-app on, push off, weekly digest. Users can change in Settings.
            emailMarketing: false,
            emailProduct: true,
            emailSecurity: true,
            emailResumeTips: true,
            pushEnabled: false,
            inAppEnabled: true,
            digestFrequency: 'WEEKLY',
          },
        },
      },
    });
  });

  // Persist the verification OTP after the user row is committed so a
  // transaction rollback never strands a valid OTP pointing nowhere.
  const otp = generateOtp();
  await saveOtp(user.id, otp, 'EMAIL_VERIFY');

  // Fire-and-forget the verification email so SMTP latency never extends
  // the request or holds the transaction. The user is already created and
  // the OTP is persisted — the email is purely a notification.
  void sendOtpEmail({
    to: email,
    otp,
    type: 'EMAIL_VERIFY',
    firstName: firstName ?? '',
  }).catch((err) => {
    // Log loudly but don't throw — registration is already complete.
    // eslint-disable-next-line no-console
    console.error('[registerUser] verification email failed:', err);
  });

  return { userId: user.id, email: user.email };
};

export const verifyEmail = async (data: VerifyEmailInput) => {
  const { email, otp } = data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError(status.NOT_FOUND, 'No account found with this email.');
  if (user.emailVerified) throw new AppError(status.BAD_REQUEST, 'Email is already verified.');

  await consumeOtp(user.id, otp, 'EMAIL_VERIFY');

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true },
  });

  await sendWelcomeEmail(email, user.name.split(' ')[0] ?? '');

  return { message: 'Email verified successfully.' };
};

export const loginUser = async (data: LoginInput, req: Request) => {
  const { email, password } = data;

  // Per-(email, ip) login rate limit. We always count the attempt up front,
  // before doing any DB or bcrypt work, so brute-forcers don't burn DB CPU.
  const ipAddress =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || 'unknown';
  await assertLoginRateLimit(email, ipAddress);

  const user = await prisma.user.findUnique({
    where: { email },
    include: { accounts: true },
  });

  if (!user) {
    // Generic message: do not reveal whether the email exists.
    throw new AppError(status.UNAUTHORIZED, 'Invalid email or password.');
  }
  if (!user.isActive) {
    throw new AppError(status.FORBIDDEN, 'Your account has been deactivated.');
  }
  if (!user.emailVerified) {
    throw new AppError(
      status.UNAUTHORIZED,
      'Please verify your email before logging in.',
      'EMAIL_NOT_VERIFIED'
    );
  }

  const credentialAccount = user.accounts.find((a) => a.providerId === 'credential');
  if (!credentialAccount?.password) {
    throw new AppError(status.UNAUTHORIZED, 'Invalid email or password.');
  }

  const isPasswordValid = await bcrypt.compare(password, credentialAccount.password);
  if (!isPasswordValid) {
    throw new AppError(status.UNAUTHORIZED, 'Invalid email or password.');
  }

  // Successful password verification clears the rate-limit counter so a
  // legitimate user who mistyped a few times is not locked out forever.
  await clearLoginRateLimit(email, ipAddress);

  // If 2FA enabled, send OTP and require verification
  if (user.twoFactorEnabled) {
    const otp = generateOtp();
    await checkOtpRateLimit(email, 'TWO_FACTOR');
    await saveOtp(user.id, otp, 'TWO_FACTOR');
    await sendOtpEmail({ to: email, otp, type: 'TWO_FACTOR', ...(user.name.split(' ')[0] !== undefined ? { firstName: user.name.split(' ')[0]! } : {}) });

    return { twoFactorRequired: true, email };
  }

  // Register device (ipAddress was extracted above for the rate limit).
  const userAgent = req.headers['user-agent'] || 'Unknown';

  const deviceId = await registerDevice(user.id, userAgent, ipAddress);

  // Issue tokens
  const accessToken = tokenUtils.createAccessToken({
    userId: user.id,
    role: user.role,
    email: user.email,
  });
  const refreshToken = tokenUtils.createRefreshToken({ userId: user.id });

  // Create session record
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      id: sessionId,
      token: accessToken,
      userId: user.id,
      deviceId,
      expiresAt,
      ipAddress,
      userAgent,
    },
  });

  return {
    twoFactorRequired: false,
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
};

export const verifyTwoFactor = async (data: TwoFactorVerifyInput, req: Request) => {
  const { email, otp } = data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError(status.NOT_FOUND, 'No account found with this email.');

  await consumeOtp(user.id, otp, 'TWO_FACTOR');

  const userAgent = req.headers['user-agent'] || 'Unknown';
  const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || '';
  const deviceId = await registerDevice(user.id, userAgent, ipAddress);

  const accessToken = tokenUtils.createAccessToken({
    userId: user.id,
    role: user.role,
    email: user.email,
  });
  const refreshToken = tokenUtils.createRefreshToken({ userId: user.id });

  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      id: sessionId,
      token: accessToken,
      userId: user.id,
      deviceId,
      expiresAt,
      ipAddress,
      userAgent,
    },
  });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
};

export const forgotPassword = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Don't leak whether user exists
    return { message: 'If an account with this email exists, an OTP has been sent.' };
  }

  await checkOtpRateLimit(email, 'FORGET_PASSWORD');
  const otp = generateOtp();
  await saveOtp(user.id, otp, 'FORGET_PASSWORD');
  await sendOtpEmail({
    to: email,
    otp,
    type: 'FORGET_PASSWORD',
    ...(user.name.split(' ')[0] !== undefined ? { firstName: user.name.split(' ')[0]! } : {}),
  });

  return { message: 'If an account with this email exists, an OTP has been sent.' };
};

export const resetPassword = async (data: ResetPasswordInput) => {
  const { email, otp, newPassword } = data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError(status.NOT_FOUND, 'No account found with this email.');

  await consumeOtp(user.id, otp, 'FORGET_PASSWORD');

  const newPasswordHash = await bcrypt.hash(newPassword, 12);

  await prisma.account.updateMany({
    where: { userId: user.id, providerId: 'credential' },
    data: { password: newPasswordHash },
  });

  // Invalidate all sessions
  await prisma.session.deleteMany({ where: { userId: user.id } });

  // Security notification — fire-and-forget so the response stays snappy.
  // If SMTP is down the reset still succeeds; the user can already log in.
  const firstName = user.name.split(' ')[0];
  void sendPasswordChangedEmail(email, firstName).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[auth] failed to send password-changed notification', err);
  });

  return { message: 'Password reset successfully. Please log in with your new password.' };
};

export const logoutUser = async (token: string, userId: string) => {
  await prisma.session.deleteMany({ where: { userId, token } });
  return { message: 'Logged out successfully.' };
};

// ─── Get Current User ────────────────────────────────

export const getMe = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      emailVerified: true,
      twoFactorEnabled: true,
      isActive: true,
      createdAt: true,
      profile: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          headline: true,
        },
      },
      limits: {
        select: {
          resumeLimit: true,
          apiLimit: true,
          resumeUsed: true,
          apiUsed: true,
          resetAt: true,
        },
      },
    },
  });
  if (!user) throw new AppError(status.UNAUTHORIZED, 'User not found.');

  // Compute profile completion percentage (same heuristic used by the user module).
  let completionPercentage = 0;
  if (user.profile) {
    const fields = [
      user.profile.firstName,
      user.profile.lastName,
      user.profile.avatarUrl,
      user.profile.headline,
    ];
    const filled = fields.filter((value) => Boolean(value && String(value).trim())).length;
    completionPercentage = Math.round((filled / fields.length) * 100);
  }

  return { ...user, completionPercentage };
};

export const resendOtp = async (email: string, type: 'EMAIL_VERIFY' | 'FORGET_PASSWORD' | 'TWO_FACTOR') => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { message: 'If an account with this email exists, an OTP has been sent.' };
  }

  // Email verification OTPs are intentionally not rate-limited — the user
  // may legitimately need to resend a code while waiting on a slow mailbox.
  if (type !== 'EMAIL_VERIFY') {
    await checkOtpRateLimit(email, type);
  }
  const otp = generateOtp();
  await saveOtp(user.id, otp, type);
  await sendOtpEmail({ to: email, otp, type, ...(user.name.split(' ')[0] !== undefined ? { firstName: user.name.split(' ')[0]! } : {}) });

  return { message: 'OTP sent successfully.' };
};

export const enable2FA = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(status.NOT_FOUND, 'User not found.');
  if (user.twoFactorEnabled) throw new AppError(status.BAD_REQUEST, '2FA is already enabled.');

  // Generate OTP to verify the user actually wants to enable 2FA
  const otp = generateOtp();
  await saveOtp(userId, otp, 'TWO_FACTOR');
  await sendOtpEmail({ to: user.email, otp, type: 'TWO_FACTOR', ...(user.name.split(' ')[0] !== undefined ? { firstName: user.name.split(' ')[0]! } : {}) });

  return { message: 'An OTP has been sent to your email to confirm 2FA activation.' };
};

export const confirm2FA = async (userId: string, otp: string) => {
  await consumeOtp(userId, otp, 'TWO_FACTOR');

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: true },
  });

  return { message: 'Two-factor authentication has been enabled.' };
};

export const disable2FA = async (userId: string, otp: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(status.NOT_FOUND, 'User not found.');
  if (!user.twoFactorEnabled) throw new AppError(status.BAD_REQUEST, '2FA is not enabled.');

  await consumeOtp(userId, otp, 'TWO_FACTOR');

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null },
  });

  return { message: 'Two-factor authentication has been disabled.' };
};
