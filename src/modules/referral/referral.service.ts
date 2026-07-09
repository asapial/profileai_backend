// ─── Referral Program (U-P13) ─────────────────────────────────────────────
// Server-side engine for the referral program. Three surfaces:
//
//   1. `ensureReferralCode(userId)` — lazily generate a per-user code
//      (PAI-XXXXXXXX, 12 chars, Base58) the first time a user opens the
//      referral page. Idempotent.
//
//   2. `linkReferee({ refereeId, referredByCode, ip, ua })` — called by
//      the register/email-verification flow. Validates the code,
//      enforces anti-fraud guards (self-referral, per-IP daily cap),
//      then creates a Referral row in PENDING.
//
//   3. `onEmailVerified(userId)` — once a referee passes email
//      verification the trigger fires; we mark the Referral REWARDED,
//      mint two RewardLedger rows (referrer + referee credits), and
//      bump `user_limit.apiLimit` for both users. Best-effort: any
//      failure inside this flow logs and returns false so the verify
//      endpoint still succeeds for the user.
// ─────────────────────────────────────────────────────────────────────────
import crypto from 'crypto';
import status from 'http-status';
import { Response } from 'express';
import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import AppError from '../../errorHelpers/AppError';
import { bustDashboardCache } from '../dashboard/dashboard.service';
import { createNotification } from '../notification/notification.service';

// Exclude easily-confused chars (0/O, 1/I/l) so users can read codes aloud.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 8;
const IP_DAILY_PREFIX = 'referral:ip:';

const makeCode = (): string => {
  const bytes = crypto.randomBytes(CODE_LEN);
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    const b = bytes[i];
    if (b === undefined) break;
    out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  }
  return `PAI-${out}`;
};

const CODE_PATTERN = /^PAI-[A-HJ-NP-Z2-9]{8}$/;

export const ensureReferralCodeForUser = async (
  userId: string
): Promise<string> => {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { referralCode: true },
  });
  if (profile?.referralCode) return profile.referralCode;

  // Generate non-guessable, unique code with bounded retries on collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode();
    try {
      // Upsert on UserProfile — there is one per user, so this either
      // sets a missing value or no-ops when the race resolved first.
      const updated = await prisma.userProfile.update({
        where: { userId },
        data: { referralCode: code },
        select: { referralCode: true },
      });
      if (updated.referralCode) return updated.referralCode;
    } catch (err: unknown) {
      // P2002 = unique violation on referralCode — retry with a new code.
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === 'P2002'
      ) {
        continue;
      }
      throw err;
    }
  }
  throw new AppError(
    status.INTERNAL_SERVER_ERROR,
    'Could not allocate a unique referral code. Please try again.'
  );
};

// ─── Public API ────────────────────────────────────────────────────────────

export const getReferralOverview = async (userId: string) => {
  const code = await ensureReferralCodeForUser(userId);

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { firstName: true },
  });

  const [referralCount, rewardedCount, rewardsAgg, recent] = await Promise.all([
    prisma.referral.count({ where: { referrerId: userId } }),
    prisma.referral.count({
      where: { referrerId: userId, status: 'REWARDED' },
    }),
    prisma.rewardLedger.aggregate({
      where: { userId, type: 'API_CREDIT', status: 'GRANTED' },
      _sum: { amount: true },
    }),
    prisma.referral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        referee: {
          select: { email: true, profile: { select: { firstName: true } } },
        },
      },
    }),
  ]);

  const program = await prisma.referralProgram.findUnique({
    where: { id: 'default' },
  });

  return {
    code,
    shareUrl: buildShareUrl(code),
    summary: {
      totalInvites: referralCount,
      rewarded: rewardedCount,
      pending: referralCount - rewardedCount,
      totalCredits: rewardsAgg._sum.amount ?? 0,
      referrerReward: program?.referrerReward ?? 50,
      refereeReward: program?.refereeReward ?? 25,
    },
    recent: recent.map((r) => ({
      id: r.id,
      refereeName:
        r.referee.profile?.firstName ?? r.referee.email.split('@')[0],
      refereeEmail: maskEmail(r.referee.email),
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      rewardedAt: r.rewardedAt?.toISOString() ?? null,
    })),
    firstName: profile?.firstName ?? null,
  };
};

const buildShareUrl = (code: string): string => {
  const base = (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(
    /\/+$/,
    ''
  );
  return `${base}/register?ref=${encodeURIComponent(code)}`;
};

const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const visible = local.length <= 2 ? local : local.slice(0, 2);
  return `${visible}***@${domain}`;
};

export const generateLink = async (
  userId: string
): Promise<{ code: string; shareUrl: string }> => {
  const code = await ensureReferralCodeForUser(userId);
  return { code, shareUrl: buildShareUrl(code) };
};

export const claimReferralCode = async (input: {
  userId: string;
  code: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ referrerId: string } | null> => {
  const code = (input.code ?? '').trim();
  if (!code || !CODE_PATTERN.test(code)) return null;

  // Look up referrer profile.
  const referrerProfile = await prisma.userProfile.findUnique({
    where: { referralCode: code },
    select: { userId: true },
  });
  if (!referrerProfile) return null;
  const referrerId = referrerProfile.userId;

  const program = await prisma.referralProgram.findUnique({
    where: { id: 'default' },
  });
  if (program && !program.isActive) return null;
  if (program?.blockSelfReferral && referrerId === input.userId) return null;

  const ip = input.ip ?? null;

  // Per-IP daily cap (best-effort — Redis can be down).
  if (program && program.dailyIpCap > 0 && ip) {
    const key = `${IP_DAILY_PREFIX}${ip}`;
    try {
      const count = await redis.incr(key);
      if (count === 1) {
        // 26 hours so the cap straddles midnight without losing data.
        await redis.expire(key, 26 * 60 * 60);
      }
      if (count > program.dailyIpCap) return null;
    } catch {
      // Fall through — never let Redis hiccups block legitimate signups.
    }
  }

  // Idempotent — only create if no existing referral row for this referee.
  try {
    await prisma.referral.create({
      data: {
        referrerId,
        refereeId: input.userId,
        referralCode: code,
        trigger: 'EMAIL_VERIFIED',
        status: 'PENDING',
        ...(ip ? { ipAddress: ip } : {}),
        ...(input.userAgent ? { userAgent: input.userAgent } : {}),
      },
    });
  } catch (err: unknown) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: string }).code === 'P2002'
    ) {
      // Already linked — return the existing referrer for downstream callers.
      const existing = await prisma.referral.findUnique({
        where: { refereeId: input.userId },
        select: { referrerId: true },
      });
      return existing ? { referrerId: existing.referrerId } : null;
    }
    throw err;
  }

  return { referrerId };
};

// Reward issuer — called from verifyEmail.
export const onEmailVerified = async (
  userId: string
): Promise<boolean> => {
  const referral = await prisma.referral.findUnique({
    where: { refereeId: userId },
  });
  if (!referral) return false;
  if (referral.status === 'REWARDED') return false;

  const program = await prisma.referralProgram.findUnique({
    where: { id: 'default' },
  });
  if (!program || !program.isActive) return false;

  const now = new Date();
  const credits: Array<{ uid: string; amount: number; reason: string }> = [
    { uid: referral.referrerId, amount: program.referrerReward, reason: 'REFERRAL_BONUS' },
    { uid: userId,               amount: program.refereeReward,  reason: 'REFERRED_SIGNUP' },
  ];

  // Mint ledger rows first; if either fails the whole tx rolls back.
  const ledgerIds: Record<string, string> = {};
  for (const c of credits) {
    const row = await prisma.rewardLedger.create({
      data: {
        userId: c.uid,
        amount: c.amount,
        reason: c.reason,
        type: 'API_CREDIT',
        status: 'GRANTED',
        metadata: { referralId: referral.id },
      },
      select: { id: true },
    });
    ledgerIds[c.uid] = row.id;
  }

  const referrerLedgerId = ledgerIds[referral.referrerId];
  if (!referrerLedgerId) {
    throw new AppError(500, 'Could not allocate ledger row for referrer.');
  }
  await prisma.referral.update({
    where: { id: referral.id },
    data: {
      status: 'REWARDED',
      rewardedAt: now,
      rewardId: referrerLedgerId,
    },
  });

  // Best-effort credit top-ups on UserLimit. If either fails, the
  // ledger still records the grant (the payout can be reconciled
  // out-of-band) — we never void a successful reward over a quota
  // write error.
  await Promise.all(
    credits.map(async (c) => {
      try {
        await prisma.userLimit.upsert({
          where: { userId: c.uid },
          create: {
            userId: c.uid,
            apiLimit: c.amount,
            resumeLimit: 5,
            apiUsed: 0,
            resumeUsed: 0,
            resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
          update: { apiLimit: { increment: c.amount } },
        });
        await bustDashboardCache(c.uid);
        await createNotification({
          userId: c.uid,
          type: 'SYSTEM',
          title: c.uid === userId ? 'Welcome bonus unlocked' : 'Referral reward earned',
          body:
            c.uid === userId
              ? `You earned ${c.amount} AI credits for joining via a friend's referral.`
              : `You earned ${c.amount} AI credits because a friend you referred just verified their email.`,
          link: '/dashboard/billing',
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[referral] credit top-up failed', err);
      }
    })
  );

  return true;
};

export const getRewards = async (userId: string) => {
  const rows = await prisma.rewardLedger.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    reason: r.reason,
    type: r.type,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));
};

export const getLeaderboard = async (userId: string) => {
  // Top-10 referrers (count of REWARDED referrals) within the last 90d.
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const top = await prisma.referral.groupBy({
    by: ['referrerId'],
    where: { status: 'REWARDED', createdAt: { gte: since } },
    _count: { _all: true },
    orderBy: { _count: { referrerId: 'desc' } },
    take: 10,
  });

  const userIds = top.map((t) => t.referrerId);
  const profiles = await prisma.userProfile.findMany({
    where: { userId: { in: userIds } },
    select: {
      userId: true,
      firstName: true,
      referralCode: true,
      user: { select: { email: true } },
    },
  });
  const profileMap = new Map(profiles.map((p) => [p.userId, p]));

  const ranked = top.map((t, idx) => {
    const p = profileMap.get(t.referrerId);
    return {
      rank: idx + 1,
      userId: t.referrerId,
      name: p?.firstName ?? (p?.user.email ?? 'Member').split('@')[0],
      avatarUrl: null as string | null,
      referralCode: p?.referralCode ?? null,
      referralCount: t._count._all,
      isYou: t.referrerId === userId,
    };
  });

  // Mark the current user's standing even if they aren't in top-10.
  if (!ranked.some((r) => r.isYou)) {
    const yourCount = await prisma.referral.count({
      where: { referrerId: userId, status: 'REWARDED' },
    });
    ranked.push({
      rank: ranked.length + 1,
      userId,
      name: 'You',
      avatarUrl: null,
      referralCode: null,
      referralCount: yourCount,
      isYou: true,
    });
  }

  return ranked;
};

// Capture referral intent from a `?ref=CODE` query param. Stored on the
// session cookie so the post-email-verification reward flow can fire.
export const captureReferralIntent = (res: Response, code: string): void => {
  if (!code || !CODE_PATTERN.test(code)) return;
  // 30 days — generous enough to cover the verify-email window.
  res.cookie('pai_ref', code, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });
};
