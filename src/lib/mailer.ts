import nodemailer, { Transporter } from 'nodemailer';
import { envVars } from '../config/env';

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = envVars.EMAIL_SENDER;

const createTransporter = (): Transporter => {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT, 10),
    secure: false, // true for 465, false for 587/1025
    auth:
      SMTP_USER && SMTP_PASS
        ? { user: SMTP_USER, pass: SMTP_PASS }
        : undefined,
  });
};

export const mailer = createTransporter();

// ─────────────────────────────────────────────────────
// Email Templates
// ─────────────────────────────────────────────────────

const baseTemplate = (content: string): string => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>ProFile AI</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f0f; margin: 0; padding: 20px; }
    .container { max-width: 520px; margin: 40px auto; background: #1a1a2e; border-radius: 16px; overflow: hidden; border: 1px solid #16213e; }
    .header { background: linear-gradient(135deg, #6C63FF 0%, #4ECDC4 100%); padding: 32px; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 24px; letter-spacing: -0.5px; }
    .body { padding: 32px; color: #e0e0e0; }
    .otp-box { background: #0f3460; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0; }
    .otp-code { font-size: 40px; font-weight: 700; letter-spacing: 12px; color: #6C63FF; font-family: monospace; }
    .otp-timer { font-size: 13px; color: #9e9e9e; margin-top: 8px; }
    .footer { padding: 20px 32px; text-align: center; font-size: 12px; color: #555; border-top: 1px solid #16213e; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>ProFile AI</h1></div>
    <div class="body">${content}</div>
    <div class="footer">© ${new Date().getFullYear()} ProFile AI. All rights reserved.<br/>This email was sent automatically. Please do not reply.</div>
  </div>
</body>
</html>
`;

// ─────────────────────────────────────────────────────
// Email Sending Functions
// ─────────────────────────────────────────────────────

export interface SendOtpOptions {
  to: string;
  otp: string;
  type: 'EMAIL_VERIFY' | 'FORGET_PASSWORD' | 'RESET_PASSWORD' | 'TWO_FACTOR';
  firstName?: string;
}

const OTP_SUBJECT_MAP: Record<SendOtpOptions['type'], string> = {
  EMAIL_VERIFY: 'Verify Your Email — ProFile AI',
  FORGET_PASSWORD: 'Password Reset Code — ProFile AI',
  RESET_PASSWORD: 'Password Reset Code — ProFile AI',
  TWO_FACTOR: 'Two-Factor Authentication Code — ProFile AI',
};

const OTP_TITLE_MAP: Record<SendOtpOptions['type'], string> = {
  EMAIL_VERIFY: 'Verify Your Email Address',
  FORGET_PASSWORD: 'Reset Your Password',
  RESET_PASSWORD: 'Reset Your Password',
  TWO_FACTOR: 'Two-Factor Authentication',
};

const OTP_DESC_MAP: Record<SendOtpOptions['type'], string> = {
  EMAIL_VERIFY: "Please use the code below to verify your email address and activate your ProFile AI account.",
  FORGET_PASSWORD: "We received a request to reset your password. Use the code below to proceed.",
  RESET_PASSWORD: "Use the code below to complete your password reset.",
  TWO_FACTOR: "Your two-factor authentication code for ProFile AI login:",
};

export const sendOtpEmail = async ({
  to,
  otp,
  type,
  firstName,
}: SendOtpOptions): Promise<void> => {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const content = `
    <p>${greeting}</p>
    <p>${OTP_DESC_MAP[type]}</p>
    <div class="otp-box">
      <div class="otp-code">${otp}</div>
      <div class="otp-timer">⏱ This code expires in 10 minutes</div>
    </div>
    <p style="font-size:13px; color:#9e9e9e;">If you did not request this, you can safely ignore this email. Your account remains secure.</p>
  `;

  await mailer.sendMail({
    from: SMTP_FROM,
    to,
    subject: OTP_SUBJECT_MAP[type],
    html: baseTemplate(`<h2 style="color:#fff;margin-bottom:8px;">${OTP_TITLE_MAP[type]}</h2>${content}`),
  });
};

export const sendWelcomeEmail = async (to: string, firstName: string): Promise<void> => {
  const content = `
    <h2 style="color:#fff;">Welcome to ProFile AI, ${firstName}! 🎉</h2>
    <p>Your account is now active. You can start building AI-powered, ATS-optimized resumes that stand out.</p>
    <p style="margin-top:24px;">
      <a href="${envVars.FRONTEND_URL}/dashboard"
         style="background:linear-gradient(135deg,#6C63FF,#4ECDC4);color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
        Go to Dashboard →
      </a>
    </p>
  `;

  await mailer.sendMail({
    from: SMTP_FROM,
    to,
    subject: 'Welcome to ProFile AI!',
    html: baseTemplate(content),
  });
};
