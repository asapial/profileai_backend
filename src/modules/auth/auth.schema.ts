import { z } from 'zod';

// ─── Register ────────────────────────────────────────
export const registerSchema = z.object({
  body: z.object({
    firstName: z.string().min(1, 'First name is required').max(50),
    lastName: z.string().min(1, 'Last name is required').max(50),
    email: z.string().email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    confirmPassword: z.string(),
  }).refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
});

// ─── Verify Email ────────────────────────────────────
export const verifyEmailSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    otp: z.string().length(6, 'OTP must be exactly 6 digits').regex(/^\d{6}$/, 'OTP must be numeric'),
  }),
});

// ─── Login ───────────────────────────────────────────
export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});

// ─── 2FA Verify ──────────────────────────────────────
export const twoFactorVerifySchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    otp: z.string().length(6, 'OTP must be exactly 6 digits').regex(/^\d{6}$/, 'OTP must be numeric'),
  }),
});

// ─── Forgot Password ─────────────────────────────────
export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
  }),
});

// ─── Reset Password ──────────────────────────────────
export const resetPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    otp: z.string().length(6, 'OTP must be exactly 6 digits').regex(/^\d{6}$/, 'OTP must be numeric'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    confirmPassword: z.string(),
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
});

// ─── OTP Resend ──────────────────────────────────────
export const resendOtpSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    type: z.enum(['EMAIL_VERIFY', 'FORGET_PASSWORD', 'TWO_FACTOR']),
  }),
});

// ─── Enable 2FA Confirm ──────────────────────────────
export const confirm2FASchema = z.object({
  body: z.object({
    otp: z.string().length(6, 'OTP must be exactly 6 digits').regex(/^\d{6}$/, 'OTP must be numeric'),
  }),
});

// ─── Disable 2FA ─────────────────────────────────────
export const disable2FASchema = z.object({
  body: z.object({
    otp: z.string().length(6, 'OTP must be exactly 6 digits').regex(/^\d{6}$/, 'OTP must be numeric'),
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];
export type TwoFactorVerifyInput = z.infer<typeof twoFactorVerifySchema>['body'];
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>['body'];
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>['body'];
export type ResendOtpInput = z.infer<typeof resendOtpSchema>['body'];
