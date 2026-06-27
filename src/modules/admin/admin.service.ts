import status from 'http-status';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';

// ─── Dashboard Stats ──────────────────────────────────

export const getDashboardStats = async () => {
  const [
    totalUsers,
    activeSessions,
    todayResumes,
    totalApiCallsThisMonth,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'USER' } }),
    prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
    prisma.resume.count({
      where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    }),
    prisma.userProfile.aggregate({ _sum: { apiCallCount: true } }),
  ]);

  return {
    totalUsers,
    activeSessions,
    todayResumes,
    totalApiCallsThisMonth: totalApiCallsThisMonth._sum.apiCallCount || 0,
  };
};

// ─── User Management ──────────────────────────────────

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
      devices: true,
      _count: { select: { resumes: true } },
    },
  });
  if (!user) throw new AppError(status.NOT_FOUND, 'User not found.');
  return user;
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

// ─── Platform Config / Settings ───────────────────────

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
      create: { key: s.key, value: s.value, description: s.description, updatedBy: adminUserId },
    })
  );
  return Promise.all(updates);
};

// ─── Analytics ────────────────────────────────────────

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
