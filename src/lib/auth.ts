import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { envVars } from "../config/env";
import {
  sendVerificationEmailHandler,
  sendResetPasswordHandler,
} from "./mailer";

/** `InputJsonValue` shape (string|number|boolean|object|array — NOT null). */
type InputJsonValue =
  | string
  | number
  | boolean
  | { [k: string]: InputJsonValue }
  | InputJsonValue[];

/**
 * Better Auth configuration.
 *
 * The frontend currently drives registration through our bespoke
 * `POST /api/v1/auth/register` controller (which fires the verification
 * email directly via `mailer.sendOtpEmail`). However, Better Auth is
 * mounted at `/api/auth/*splat` for any client that wants to hit it
 * directly, and we want sign-ups there to behave identically to ours.
 *
 * To do that we wire Better Auth's email hooks to the same EJS mailer so
 * the templates are reused, and add a `databaseHooks.user.create.after`
 * callback that provisions the side-profile rows the rest of the app
 * depends on (UserProfile, UserLimit, NotificationPreference).
 *
 * Hook signature reference (see
 * `node_modules/@better-auth/core/dist/types/init-options.d.mts`):
 *
 *   emailVerification.sendVerificationEmail(
 *     { user, url, token }: { user: User; url: string; token: string },
 *     request?: Request,
 *   ) => Promise<void>
 *
 *   emailAndPassword.sendResetPassword(
 *     { user, url, token }: { user: User; url: string; token: string },
 *     request?: Request,
 *   ) => Promise<void>
 *
 *   databaseHooks.user.create.after(
 *     user: User & Record<string, unknown>,
 *     context: GenericEndpointContext | null,
 *   ) => Promise<void>
 */

// ─── Helpers ────────────────────────────────────────────

/**
 * Pull default resume + API limits from PlatformConfig; fall back to safe
 * values so a missing config row never blocks sign-ups.
 */
const resolveDefaultLimits = async (): Promise<{
  resumeLimit: number;
  apiLimit: number;
}> => {
  const [resumeCfg, apiCfg] = await Promise.all([
    prisma.platformConfig.findUnique({ where: { key: "default_resume_limit" } }),
    prisma.platformConfig.findUnique({ where: { key: "default_api_limit" } }),
  ]);
  return {
    resumeLimit: parseInt(resumeCfg?.value ?? "", 10) || 5,
    apiLimit: parseInt(apiCfg?.value ?? "", 10) || 50,
  };
};

/**
 * After a Better Auth user is created, provision the dependent rows the
 * app expects. We swallow errors so a transient DB blip never poisons the
 * sign-up — the user can still sign in and complete onboarding later.
 */
const provisionUserSideRows = async (
  userId: string,
  fullName?: string | null,
): Promise<void> => {
  try {
    const { resumeLimit, apiLimit } = await resolveDefaultLimits();

    // Split full name once so we can satisfy the UserProfile contract
    // (`firstName` + `lastName` are required strings in our schema).
    const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
    const firstName = parts[0] ?? "";
    const lastName = parts.slice(1).join(" ");

    await prisma.$transaction(async (tx) => {
      await tx.userProfile.create({
        data: {
          userId,
          firstName,
          lastName,
          // education + experience are JSON columns; empty arrays are the
          // schema default and the type-system accepts `unknown as ...` once.
          education: [] as unknown as InputJsonValue,
          experience: [] as unknown as InputJsonValue,
          skills: [],
          languages: [],
        },
      });
      await tx.userLimit.create({
        data: {
          userId,
          resumeLimit,
          apiLimit,
          resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      await tx.notificationPreference.create({
        data: {
          userId,
          emailMarketing: false,
          emailProduct: true,
          emailSecurity: true,
          emailResumeTips: true,
          pushEnabled: false,
          inAppEnabled: true,
          digestFrequency: "WEEKLY",
        },
      });
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      "[auth] failed to provision side rows for user",
      userId,
      err,
    );
  }
};

// ─── Better Auth Instance ───────────────────────────────

export const auth = betterAuth({
  appName: "ProFile AI",
  secret: envVars.BETTER_AUTH_SECRET,
  baseURL: envVars.BETTER_AUTH_URL,

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    autoSignIn: false, // we sign in via our own /auth/login after verification
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // 10-minute reset window — matches our bespoke flow.
    resetPasswordTokenExpiresIn: 60 * 10,
    // Better Auth's hook fires after the verification token is generated;
    // our handler strips the token out and renders the EJS template.
    sendResetPassword: async (data) => {
      try {
        await sendResetPasswordHandler(data);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[auth] sendResetPassword hook failed:", err);
      }
    },
  },

  emailVerification: {
    // Send on every sign-up. The hook receives `{ user, url, token }`.
    sendOnSignUp: true,
    // Don't re-send on sign-in — our bespoke /auth/login is the entrypoint.
    sendOnSignIn: false,
    // User clicks the link → Better Auth marks verified → we still want them
    // to land on /login (we don't auto-create a session).
    autoSignInAfterVerification: false,
    // 1-hour verification window.
    expiresIn: 60 * 60,
    sendVerificationEmail: async (data) => {
      try {
        await sendVerificationEmailHandler(data);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[auth] sendVerificationEmail hook failed:", err);
      }
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },

  /**
   * Provision the side-profile / limits / notification rows whenever
   * Better Auth creates a user. The `before` hook is left alone so the
   * default user fields are persisted as-is.
   */
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          if (!user?.id) return;
          // Better Auth generates a string id by default, but guard against
          // custom adapters that return something unexpected.
          const id = String(user.id);
          const fullName =
            typeof (user as { name?: unknown }).name === "string"
              ? ((user as { name?: string }).name as string)
              : undefined;
          await provisionUserSideRows(id, fullName);
        },
      },
    },
  },

  advanced: {
    cookiePrefix: "better-auth",
    useSecureCookies: envVars.NODE_ENV === "production",
    crossSubDomainCookies: {
      enabled: false,
    },
    disableCSRFCheck: true,
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      httpOnly: false,
    },
  },

  // Surface Better Auth's own errors so SMTP / adapter failures show up
  // in our log stream alongside the bespoke mailer errors.
  logger: {
    level: "info",
    disabled: false,
  },
});
