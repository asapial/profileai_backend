// ─── Aggregate summary for the user dashboard ──────────────
// One round-trip → user + profile completion + limits + recent
// resumes + recent applications + notification preview. Cached for
// 60 seconds per user; cache is busted when resumes, applications,
// notification prefs, or limits change.
import { prisma } from '../../lib/prisma';
import { getOrSet } from '../../lib/cache';
import { CACHE_TTL } from '../../lib/cache';
import { invalidate } from '../../lib/cache';

export interface DashboardSummary {
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    emailVerified: boolean;
    twoFactorEnabled: boolean;
    createdAt: string;
  };
  profile: {
    completionPercentage: number;
    missingFields: string[];
    headline: string | null;
    firstName: string | null;
    lastName: string | null;
    skillsCount: number;
    experienceCount: number;
    educationCount: number;
  };
  limits: {
    resumeLimit: number;
    apiLimit: number;
    resumeUsed: number;
    apiUsed: number;
    resetAt: string;
    resumePercent: number;
    apiPercent: number;
  };
  stats: {
    resumesCreated: number;
    activeApplications: number;
    averageAtsScore: number | null;
    unreadNotifications: number;
  };
  recentResumes: Array<{
    id: string;
    title: string;
    status: string;
    atsScore: number | null;
    updatedAt: string;
    templateId: string;
  }>;
  recentApplications: Array<{
    id: string;
    company: string;
    role: string;
    status: string;
    appliedAt: string;
  }>;
  notifications: Array<{
    id: string;
    title: string;
    body: string | null;
    type: string;
    read: boolean;
    createdAt: string;
  }>;
}

const summaryKey = (userId: string) => `dashboard:summary:${userId}`;

/**
 * Bust the cached summary. Call this from any code path that
 * changes the dashboard's underlying numbers (resume create,
 * application update, etc.).
 */
export const bustDashboardCache = (userId: string): Promise<void> =>
  invalidate(summaryKey(userId));

export const getDashboardSummary = async (
  userId: string,
): Promise<DashboardSummary> =>
  getOrSet<DashboardSummary>(summaryKey(userId), CACHE_TTL.DASHBOARD_SUMMARY, () =>
    loadSummary(userId),
  );

async function loadSummary(userId: string): Promise<DashboardSummary> {
  // Fan out all reads in a single round trip; we deliberately
  // denormalize on output rather than nest — the frontend wants
  // flat widgets.
  const [
    user,
    profile,
    limits,
    resumes,
    recentResumes,
    recentApplications,
    notifications,
    unreadCount,
    activeApplicationsCount,
    avgAts,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        twoFactorEnabled: true,
        createdAt: true,
        profile: { select: { avatarUrl: true } },
      },
    }),
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.userLimit.findUnique({ where: { userId } }),
    prisma.resume.count({ where: { userId } }),
    prisma.resume.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        atsScore: true,
        updatedAt: true,
        templateId: true,
      },
    }),
    prisma.jobApplication.findMany({
      where: { userId },
      orderBy: { appliedAt: 'desc' },
      take: 3,
      select: {
        id: true,
        company: true,
        role: true,
        status: true,
        appliedAt: true,
      },
    }),
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        id: true,
        title: true,
        body: true,
        type: true,
        read: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({ where: { userId, read: false } }),
    prisma.jobApplication.count({
      where: {
        userId,
        status: { in: ['APPLIED', 'INTERVIEW'] },
      },
    }),
    prisma.resume.aggregate({
      where: { userId, atsScore: { not: null } },
      _avg: { atsScore: true },
    }),
  ]);

  if (!user) {
    // Force a 404 at the controller layer — surface the same error
    // the existing getProfile does.
    throw new Error('User not found.');
  }

  // Profile completeness — matches the existing getProfile() heuristic
  // but also emits the missing-field names so the dashboard can show
  // actionable nudges.
  const checkList: Array<[string, unknown]> = [
    ['firstName', profile?.firstName],
    ['lastName', profile?.lastName],
    ['phone', profile?.phone],
    ['headline', profile?.headline],
    ['bio', profile?.bio],
    ['location', profile?.location],
    ['website', profile?.website],
    ['linkedIn', profile?.linkedIn],
    ['avatarUrl', profile?.avatarUrl],
    ['skills', profile?.skills && profile.skills.length > 0],
    ['experience', Array.isArray(profile?.experience) && (profile.experience as unknown[]).length > 0],
    ['education', Array.isArray(profile?.education) && (profile.education as unknown[]).length > 0],
  ];
  const missingFields = checkList
    .filter(([, value]) => !value)
    .map(([name]) => name);
  const completedCount = checkList.length - missingFields.length;
  const completionPercentage = Math.round((completedCount / checkList.length) * 100);

  const safeLimits = limits ?? {
    resumeLimit: 0,
    apiLimit: 0,
    resumeUsed: 0,
    apiUsed: 0,
    resetAt: new Date(0),
  };

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      createdAt: user.createdAt.toISOString(),
      avatarUrl: user.profile?.avatarUrl ?? null,
    },
    profile: {
      completionPercentage,
      missingFields,
      headline: profile?.headline ?? null,
      firstName: profile?.firstName ?? null,
      lastName: profile?.lastName ?? null,
      skillsCount: profile?.skills?.length ?? 0,
      experienceCount: Array.isArray(profile?.experience)
        ? (profile.experience as unknown[]).length
        : 0,
      educationCount: Array.isArray(profile?.education)
        ? (profile.education as unknown[]).length
        : 0,
    },
    limits: {
      resumeLimit: safeLimits.resumeLimit,
      apiLimit: safeLimits.apiLimit,
      resumeUsed: safeLimits.resumeUsed,
      apiUsed: safeLimits.apiUsed,
      resetAt:
        safeLimits.resetAt instanceof Date
          ? safeLimits.resetAt.toISOString()
          : new Date(safeLimits.resetAt).toISOString(),
      resumePercent:
        safeLimits.resumeLimit === 0
          ? 0
          : Math.round((safeLimits.resumeUsed / safeLimits.resumeLimit) * 100),
      apiPercent:
        safeLimits.apiLimit === 0
          ? 0
          : Math.round((safeLimits.apiUsed / safeLimits.apiLimit) * 100),
    },
    stats: {
      resumesCreated: resumes,
      activeApplications: activeApplicationsCount,
      averageAtsScore:
        avgAts._avg.atsScore !== null && avgAts._avg.atsScore !== undefined
          ? Math.round(avgAts._avg.atsScore)
          : null,
      unreadNotifications: unreadCount,
    },
    recentResumes: recentResumes.map((r) => ({
      ...r,
      updatedAt: r.updatedAt.toISOString(),
      status: r.status as string,
    })),
    recentApplications: recentApplications.map((a) => ({
      ...a,
      appliedAt: a.appliedAt.toISOString(),
      status: a.status as string,
    })),
    notifications: notifications.map((n) => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
      type: n.type as string,
    })),
  };
}
