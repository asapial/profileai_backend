import status from 'http-status';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';
import { forgotPassword, registerUser } from '../auth/auth.service';
import { Role } from '../../../prisma/generated/prisma/enums';
import { envVars } from '../../config/env';
import { jwtUtils } from '../../utils/jwt';

export { getDashboardStats, recordDashboardAccess } from './admin.dashboard.service';

// ─── Dashboard Stats ────────────────────────────────────────────────────────
const getLegacyDashboardStats = async () => {
  const now = new Date();
  const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [
    totalUsers,
    activeUsers,
    bannedUsers,
    todayResumes,
    totalApiCallsThisMonth,
    newUsersLast24h,
    newUsersThisMonth,
    newUsersLastMonth,
    recentResumes,
    recentUsers,
    bannedLast24h,
    maintenanceSetting,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'USER' } }),
    prisma.user.count({ where: { role: 'USER', isActive: true } }),
    prisma.user.count({ where: { role: 'USER', isActive: false } }),
    prisma.resume.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.userProfile.aggregate({ _sum: { apiCallCount: true } }),
    prisma.user.count({
      where: { role: 'USER', createdAt: { gte: last24h } },
    }),
    prisma.user.count({
      where: { role: 'USER', createdAt: { gte: startOfMonth } },
    }),
    prisma.user.count({
      where: { role: 'USER', createdAt: { gte: startOfLastMonth, lt: startOfMonth } },
    }),
    prisma.resume.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: 'USER' },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    }),
    prisma.user.count({
      where: { role: 'USER', isActive: false, updatedAt: { gte: last24h } },
    }),
    prisma.platformConfig.findUnique({ where: { key: 'maintenance_mode' } }),
  ]);

  const monthDelta =
    newUsersLastMonth > 0
      ? Math.round(((newUsersThisMonth - newUsersLastMonth) / newUsersLastMonth) * 100)
      : newUsersThisMonth > 0
        ? 100
        : 0;

  const stats = [
    {
      label: 'Total users',
      value: totalUsers,
      hint: `${activeUsers} active · ${bannedUsers} banned`,
      trend: monthDelta > 0 ? 'up' : monthDelta < 0 ? 'down' : 'flat',
    },
    {
      label: 'New this month',
      value: newUsersThisMonth,
      hint:
        monthDelta === 0
          ? 'Flat vs last month'
          : `${monthDelta > 0 ? '+' : ''}${monthDelta}% vs last month`,
      trend: monthDelta > 0 ? 'up' : monthDelta < 0 ? 'down' : 'flat',
    },
    {
      label: 'Resumes today',
      value: todayResumes,
      hint: `${newUsersLast24h} new signup${newUsersLast24h === 1 ? '' : 's'} in last 24h`,
      trend: 'flat',
    },
    {
      label: 'AI API calls',
      value: totalApiCallsThisMonth._sum.apiCallCount || 0,
      hint: 'This month to date',
      trend: 'flat',
    },
  ];

  const activity: Array<{
    id: string;
    actor: { id: string; name: string | null; role: 'USER' | 'ADMIN' };
    action: string;
    target: string | null;
    createdAt: string;
  }> = [
    ...recentUsers.map((u) => ({
      id: `signup-${u.id}`,
      actor: { id: u.id, name: u.name, role: u.role },
      action: 'signed up',
      target: u.email,
      createdAt: u.createdAt.toISOString(),
    })),
    ...recentResumes.map((r) => ({
      id: `resume-${r.id}`,
      actor: r.user
        ? { id: r.user.id, name: r.user.name, role: r.user.role }
        : { id: 'unknown', name: null, role: 'USER' as const },
      action: 'created a resume',
      target: r.title ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 10);

  const alerts: Array<{
    id: string;
    level: 'info' | 'warning' | 'critical';
    title: string;
    body: string | null;
    createdAt: string;
  }> = [];

  if (maintenanceSetting?.value === 'true') {
    alerts.push({
      id: 'maintenance-mode',
      level: 'critical',
      title: 'Maintenance mode is ON',
      body: 'All non-admin traffic is being blocked.',
      createdAt: maintenanceSetting.updatedAt.toISOString(),
    });
  }
  if (bannedLast24h > 0) {
    alerts.push({
      id: 'banned-24h',
      level: 'warning',
      title: `${bannedLast24h} user${bannedLast24h === 1 ? '' : 's'} banned in the last 24h`,
      body: 'Review recent moderation actions.',
      createdAt: now.toISOString(),
    });
  }
  if (newUsersLast24h === 0) {
    alerts.push({
      id: 'no-signups',
      level: 'info',
      title: 'No new signups in the last 24h',
      body: 'Signups are flat — consider checking acquisition channels.',
      createdAt: now.toISOString(),
    });
  }

  const quickLinks = [
    {
      label: 'User directory',
      href: '/admin/users',
      description: 'Search, filter, and act on accounts',
    },
    {
      label: 'Templates',
      href: '/admin/templates',
      description: 'Manage resume templates and defaults',
    },
    {
      label: 'Analytics',
      href: '/admin/analytics',
      description: 'Usage, revenue, and ATS trends',
    },
    {
      label: 'Platform settings',
      href: '/admin/settings',
      description: 'Limits, sessions, and 2FA policy',
    },
  ];

  return {
    stats,
    activity,
    alerts,
    quickLinks,
    generatedAt: now.toISOString(),
  };
};

// ─── User Management ────────────────────────────────────────────────────────

export const listUsers = async (page = 1, limit = 20, search?: string, roleFilter?: string, statusFilter?: string) => {
  const where: Record<string, unknown> = {
    role: 'USER',
    ...(search ? {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    } : {}),
    ...(statusFilter === 'active' ? { isActive: true } : {}),
    ...(statusFilter === 'banned' ? { isActive: false } : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: where as any,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        profile: { select: { firstName: true, lastName: true, avatarUrl: true } },
        limits: true,
        _count: { select: { resumes: true } },
      },
    }),
    prisma.user.count({ where: where as any }),
  ]);

  return { users, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const getUserById = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      limits: true,
      sessions: {
        include: { device: true },
        orderBy: { updatedAt: 'desc' },
      },
      subscriptions: {
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
  if (!user) throw new AppError(status.NOT_FOUND, 'User not found.');

  const [resumeCount, exportsThisMonth, invoices, activity] =
    await Promise.all([
      prisma.resume.count({ where: { userId } }),
      prisma.exportJob.count({
        where: {
          userId,
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
      prisma.invoice.findMany({ where: { userId } }),
      prisma.auditLog.findMany({
        where: {
          OR: [
            { actorId: userId },
            { entityType: 'User', entityId: userId },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);

  const subscription = user.subscriptions[0] ?? null;
  const lastSession = user.sessions[0] ?? null;
  const activeStatuses = new Set(['ACTIVE', 'TRIALING']);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    emailVerified: user.emailVerified,
    twoFactorEnabled: user.twoFactorEnabled,
    createdAt: user.createdAt,
    lastLoginAt: lastSession?.updatedAt ?? null,
    profile: user.profile
      ? {
          firstName: user.profile.firstName,
          lastName: user.profile.lastName,
          phone: user.profile.phone,
          avatarUrl: user.profile.avatarUrl,
          location: user.profile.location,
          headline: user.profile.headline,
        }
      : null,
    limits: user.limits
      ? {
          resumeLimit: user.limits.resumeLimit,
          apiLimit: user.limits.apiLimit,
          overrideByAdmin: user.limits.overrideByAdmin,
          resetAt: user.limits.resetAt,
        }
      : null,
    plan: subscription
      ? {
          id: subscription.plan.id,
          name: subscription.plan.name,
          interval:
            subscription.plan.interval === 'YEAR' ? 'year' : 'month',
          renewsAt: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        }
      : null,
    usage: {
      resumeCount,
      aiCallsThisMonth: user.limits?.apiUsed ?? 0,
      exportsThisMonth,
    },
    billing: {
      totalSpentMinor: invoices.reduce(
        (sum, invoice) => sum + invoice.amountPaid,
        0,
      ),
      currency: invoices[0]?.currency ?? 'usd',
      invoicesCount: invoices.length,
      hasActiveSubscription: subscription
        ? activeStatuses.has(subscription.status)
        : false,
      subscriptionRenewsAt: subscription?.currentPeriodEnd ?? null,
    },
    sessions: user.sessions.map((session) => ({
      id: session.id,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      deviceLabel: session.device?.deviceName ?? null,
      isCurrent: false,
      lastActiveAt: session.updatedAt,
    })),
    activity: activity.map((entry) => ({
      id: entry.id,
      action: entry.action,
      createdAt: entry.createdAt,
      meta: entry.metadata,
    })),
  };
};

export const inviteUser = async (input: { name: string; email: string }) => {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !email.includes('@')) {
    throw new AppError(status.BAD_REQUEST, 'A valid name and email are required.');
  }
  const [firstName, ...rest] = name.split(/\s+/);
  const lastName = rest.join(' ') || 'User';
  const temporaryPassword = `Inv!${crypto.randomUUID()}9A`;
  const created = await registerUser({
    firstName: firstName ?? 'Invited',
    lastName,
    email,
    password: temporaryPassword,
    confirmPassword: temporaryPassword,
    acceptTerms: true,
  });
  let passwordSetupEmailSent = false;
  try {
    await forgotPassword(email);
    passwordSetupEmailSent = true;
  } catch {
    // The account remains valid and the admin can resend the reset later.
  }
  return {
    ...created,
    passwordSetupEmailSent,
    message: passwordSetupEmailSent
      ? 'Invitation and password setup emails were queued.'
      : 'User created, but the password setup email could not be sent.',
  };
};

export const revokeUserSession = async (
  userId: string,
  sessionId: string,
) => {
  const result = await prisma.session.deleteMany({
    where: { id: sessionId, userId },
  });
  if (result.count === 0) {
    throw new AppError(status.NOT_FOUND, 'Session not found.');
  }
  return { status: 'revoked' as const, auditLogId: crypto.randomUUID() };
};

export const impersonateUser = async (
  adminId: string,
  userId: string,
) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, isActive: true },
  });
  if (!user || user.role !== 'USER' || !user.isActive) {
    throw new AppError(
      status.BAD_REQUEST,
      'Only active user accounts can be impersonated.',
    );
  }
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const impersonationToken = jwtUtils.createToken(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      impersonatedBy: adminId,
      purpose: 'ADMIN_IMPERSONATION',
    },
    envVars.ACCESS_TOKEN_SECRET,
    { expiresIn: '15m' },
  );
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: 'USER_IMPERSONATION_STARTED',
      entityType: 'User',
      entityId: user.id,
      metadata: { expiresAt: expiresAt.toISOString() },
    },
  });
  return { impersonationToken, expiresAt: expiresAt.toISOString() };
};

export const updateUserLimits = async (
  userId: string,
  resumeLimit: number,
  apiLimit: number
) => {
  return prisma.userLimit.upsert({
    where: { userId },
    update: { resumeLimit, apiLimit, overrideByAdmin: true },
    create: {
      userId,
      resumeLimit,
      apiLimit,
      resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      overrideByAdmin: true,
    },
  });
};

export const toggleUserStatus = async (userId: string, isActive: boolean) => {
  return prisma.user.update({ where: { id: userId }, data: { isActive } });
};

export const deleteUser = async (userId: string) => {
  await prisma.user.delete({ where: { id: userId } });
  return { message: 'User deleted permanently.' };
};

export const changeUserRole = async (userId: string, role: Role) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!user) throw new AppError(status.NOT_FOUND, 'User not found.');

  if (user.role === 'ADMIN' && role !== 'ADMIN') {
    const remainingAdmins = await prisma.user.count({
      where: { role: 'ADMIN' },
    });
    if (remainingAdmins <= 1) {
      throw new AppError(
        status.BAD_REQUEST,
        'Cannot demote the last remaining admin.'
      );
    }
  }

  return prisma.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true, role: true },
  });
};

export const verifyUserEmail = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, emailVerified: true },
  });
  if (!user) throw new AppError(status.NOT_FOUND, 'User not found.');

  if (user.emailVerified) {
    return { id: user.id, email: user.email, emailVerified: true, alreadyVerified: true };
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { emailVerified: true },
    select: { id: true, email: true, emailVerified: true },
  });
  return { ...updated, alreadyVerified: false };
};

export const forceResetUser = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, isActive: true },
  });
  if (!user) throw new AppError(status.NOT_FOUND, 'User not found.');

  // Reuse the public forgot-password flow: it sends an OTP email and applies
  // rate limiting. Don't surface errors to the admin — the email pipeline
  // shouldn't block the action.
  let emailSent = false;
  try {
    await forgotPassword(user.email);
    emailSent = true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[admin] force-reset email failed', err);
  }

  // Invalidate existing sessions so any cached credentials stop working.
  await prisma.session.deleteMany({ where: { userId: user.id } });

  return {
    id: user.id,
    email: user.email,
    emailSent,
    message: emailSent
      ? 'Password reset email sent. Existing sessions invalidated.'
      : 'Existing sessions invalidated, but email delivery failed. Check SMTP.',
  };
};

export type BulkUserAction = 'ban' | 'unban' | 'verify' | 'activate';

export const bulkUserAction = async (
  userIds: string[],
  action: BulkUserAction
) => {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new AppError(status.BAD_REQUEST, 'No user IDs provided.');
  }

  let data: Record<string, unknown> = {};
  switch (action) {
    case 'ban':
      data = { isActive: false };
      break;
    case 'unban':
    case 'activate':
      data = { isActive: true };
      break;
    case 'verify':
      data = { emailVerified: true };
      break;
    default:
      throw new AppError(status.BAD_REQUEST, `Unknown bulk action: ${action}`);
  }

  const result = await prisma.user.updateMany({
    where: { id: { in: userIds } },
    data,
  });

  return { affected: result.count, action };
};

// ─── Platform Config / Settings ─────────────────────────────────────────────

export const getSettings = async () => {
  return prisma.platformConfig.findMany({ orderBy: { key: 'asc' } });
};

export const updateSettings = async (
  settings: Array<{ key: string; value: string; description?: string }>,
  adminUserId: string
) => {
  const updates = settings.map((s) =>
    prisma.platformConfig.upsert({
      where: { key: s.key },
      update: { value: s.value, updatedBy: adminUserId },
      create: {
        key: s.key,
        value: s.value,
        ...(s.description !== undefined ? { description: s.description } : { description: null }),
        updatedBy: adminUserId,
      },
    })
  );
  return Promise.all(updates);
};

// ─── Analytics ──────────────────────────────────────────────────────────────

export const getAnalytics = async (from: Date, to: Date) => {
  const [
    userGrowth,
    resumeVolume,
    templateUsage,
    atsScoreDistribution,
  ] = await Promise.all([
    prisma.user.groupBy({
      by: ['createdAt'],
      where: { createdAt: { gte: from, lte: to }, role: 'USER' },
      _count: { id: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.resume.groupBy({
      by: ['createdAt'],
      where: { createdAt: { gte: from, lte: to } },
      _count: { id: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.resume.groupBy({
      by: ['templateId'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    }),
    prisma.resume.aggregate({
      where: { atsScore: { not: null } },
      _avg: { atsScore: true },
      _min: { atsScore: true },
      _max: { atsScore: true },
    }),
  ]);

  return { userGrowth, resumeVolume, templateUsage, atsScoreDistribution };
};
