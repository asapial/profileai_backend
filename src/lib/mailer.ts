import nodemailer, { Transporter } from 'nodemailer';
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { envVars } from '../config/env';

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = envVars.EMAIL_SENDER;

// ──────────────────────────────────────────────────────────
// Transporter
// ──────────────────────────────────────────────────────────

const createTransporter = (): Transporter => {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT, 10),
    secure: parseInt(SMTP_PORT, 10) === 465, // 465 = SMTPS, 587/1025 = STARTTLS / plaintext
    auth:
      SMTP_USER && SMTP_PASS
        ? { user: SMTP_USER, pass: SMTP_PASS }
        : undefined,
    // Give SMTP servers a fair chance to respond before we error out.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
};

export const mailer = createTransporter();

// ──────────────────────────────────────────────────────────
// Template resolution
// ──────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_DIR = path.resolve(__dirname, '../emailTemplate');

export type EmailTemplateName =
  | 'verificationEmail'
  | 'forgotPasswordEmail'
  | 'resetPasswordEmail'
  | 'twoFactorEmail'
  | 'welcomeEmail'
  | 'passwordChangedEmail';

export interface BaseTemplateData {
  /** First name (or empty string) for the greeting. */
  firstName: string;
  /** Frontend origin, used for the footer link + CTA targets. */
  frontendUrl: string;
  /** Current year (auto-filled if not provided). */
  year?: number;
  /** Optional pre-computed full action URL (e.g. dashboard link). */
  actionUrl?: string;
}

export interface OtpTemplateData extends BaseTemplateData {
  /** The 6-digit OTP code. */
  otp: string;
  /** How many minutes the OTP remains valid. */
  expiryMinutes: number;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  template: EmailTemplateName;
  data: Record<string, unknown>;
}

/**
 * Render a leaf EJS template inside `baseEmailLayout.ejs`. The leaf template's
 * compiled HTML is assigned to `body` and the layout's footer / header wrap
 * around it. Layout-level fields (`year`, `frontendUrl`, `title`) are
 * auto-populated if missing from the caller payload.
 */
const renderTemplate = async (
  template: EmailTemplateName,
  data: Record<string, unknown>,
): Promise<{ html: string; subject: string }> => {
  const templatePath = path.join(TEMPLATE_DIR, `${template}.ejs`);
  const layoutPath = path.join(TEMPLATE_DIR, 'baseEmailLayout.ejs');

  const enriched = {
    ...data,
    year: (data.year as number | undefined) ?? new Date().getFullYear(),
    frontendUrl: (data.frontendUrl as string | undefined) ?? envVars.FRONTEND_URL,
    title: (data.title as string | undefined) ?? 'ProFile AI',
  };

  // Render the leaf template first so its HTML is available to the layout via
  // the `body` local. We use ejs.renderFile with `{ filename, root }` and the
  // include() helper will resolve relative paths off `root`.
  const leafHtml = await ejs.renderFile(templatePath, enriched, {
    async: true,
    root: TEMPLATE_DIR,
    filename: templatePath,
  });

  const layoutData = { ...enriched, body: leafHtml };
  const html = await ejs.renderFile(layoutPath, layoutData, {
    async: true,
    root: TEMPLATE_DIR,
    filename: layoutPath,
  });

  // Subject lines per template (kept here so senders can't drift them).
  const SUBJECTS: Record<EmailTemplateName, string> = {
    verificationEmail: 'Verify Your Email — ProFile AI',
    forgotPasswordEmail: 'Password Reset Code — ProFile AI',
    resetPasswordEmail: 'Password Reset Code — ProFile AI',
    twoFactorEmail: 'Two-Factor Authentication Code — ProFile AI',
    welcomeEmail: 'Welcome to ProFile AI!',
    passwordChangedEmail: 'Your ProFile AI password was changed',
  };

  return { html, subject: SUBJECTS[template] };
};

/**
 * Low-level send: render `template` with `data`, wrap in the shared layout,
 * then hand the result to nodemailer. Logs but does not throw on failure
 * (callers can opt back into strict mode with `throwOnError: true`).
 */
export const sendTemplatedEmail = async (
  options: SendEmailOptions & { throwOnError?: boolean | undefined },
): Promise<void> => {
  try {
    const { html, subject } = await renderTemplate(options.template, options.data);

    await mailer.sendMail({
      from: SMTP_FROM,
      to: options.to,
      subject,
      html,
    });

    // eslint-disable-next-line no-console
    console.log(`[mailer] sent "${options.template}" → ${options.to} (subject: "${subject}")`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[mailer] failed to send "${options.template}" → ${options.to}:`, err);
    if (options.throwOnError) throw err;
  }
};

// ──────────────────────────────────────────────────────────
// Typed helpers used by the auth + user flows
// ──────────────────────────────────────────────────────────

/** Send a 6-digit OTP code for any of the auth flows. */
export const sendOtpEmail = async (args: {
  to: string;
  otp: string;
  type: 'EMAIL_VERIFY' | 'FORGET_PASSWORD' | 'RESET_PASSWORD' | 'TWO_FACTOR';
  firstName?: string;
  /** Override expiry display (default 10 minutes). */
  expiryMinutes?: number;
  throwOnError?: boolean | undefined;
}): Promise<void> => {
  const templateByType: Record<typeof args.type, EmailTemplateName> = {
    EMAIL_VERIFY: 'verificationEmail',
    FORGET_PASSWORD: 'forgotPasswordEmail',
    RESET_PASSWORD: 'forgotPasswordEmail',
    TWO_FACTOR: 'twoFactorEmail',
  };

  await sendTemplatedEmail({
    to: args.to,
    subject: '', // subject is derived from the template name
    template: templateByType[args.type],
    data: {
      firstName: args.firstName ?? '',
      otp: args.otp,
      expiryMinutes: args.expiryMinutes ?? 10,
    },
    throwOnError: args.throwOnError,
  });
};

/** Welcome email — sent immediately after `emailVerified` flips to true. */
export const sendWelcomeEmail = async (
  to: string,
  firstName: string,
  options: { throwOnError?: boolean | undefined } = {},
): Promise<void> => {
  await sendTemplatedEmail({
    to,
    subject: '',
    template: 'welcomeEmail',
    data: {
      firstName,
      actionUrl: `${envVars.FRONTEND_URL}/dashboard`,
    },
    throwOnError: options.throwOnError,
  });
};

/** Password-changed security notification. */
export const sendPasswordChangedEmail = async (
  to: string,
  firstName?: string,
  options: { throwOnError?: boolean | undefined } = {},
): Promise<void> => {
  await sendTemplatedEmail({
    to,
    subject: '',
    template: 'passwordChangedEmail',
    data: { firstName: firstName ?? '' },
    throwOnError: options.throwOnError,
  });
};

// ──────────────────────────────────────────────────────────
// Better Auth hook adapters
//
// Better Auth calls these when it triggers an OTP email. The shape of the
// payload is whatever Better Auth decides to pass — we just normalize it to
// our `sendOtpEmail` signature and let the template engine do the rest.
// ──────────────────────────────────────────────────────────

/**
 * Better Auth `emailVerification.sendVerificationEmail` adapter. Better Auth
 * passes `{ user: { email, name }, url, token }` where `url` is the
 * verification link and `token` is the OTP. We extract the OTP and forward.
 */
export const sendVerificationEmailHandler = async (
  payload: { user: { email: string; name?: string }; url?: string; token?: string },
): Promise<void> => {
  const otp = payload.token ?? '';
  const firstName = (payload.user.name ?? '').split(' ')[0] ?? '';
  await sendOtpEmail({
    to: payload.user.email,
    otp,
    type: 'EMAIL_VERIFY',
    firstName,
    throwOnError: false, // Never block sign-up on SMTP hiccups.
  });
};

/**
 * Better Auth `emailAndPassword.sendResetPassword` adapter. Better Auth passes
 * `{ user: { email, name }, url, token }`.
 */
export const sendResetPasswordHandler = async (
  payload: { user: { email: string; name?: string }; url?: string; token?: string },
): Promise<void> => {
  const otp = payload.token ?? '';
  const firstName = (payload.user.name ?? '').split(' ')[0] ?? '';
  await sendOtpEmail({
    to: payload.user.email,
    otp,
    type: 'FORGET_PASSWORD',
    firstName,
    throwOnError: false,
  });
};
