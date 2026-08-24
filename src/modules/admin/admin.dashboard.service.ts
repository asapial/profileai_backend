import { envVars } from '../../config/env';
import { CACHE_TTL, getOrSet } from '../../lib/cache';
import { prisma } from '../../lib/prisma';
import {
  buildDashboardStats,
  buildSevenDayTrend,
  startOfUtcDay,
  type DashboardMetricNumbers,
} from './admin.dashboard';

const QUICK_LINKS = [
  { label: 'User directory', href: '/admin/users', description: 'Search, filter, and act on accounts' },
  { label: 'Templates', href: '/admin/templates', description: 'Manage resume templates and defaults' },
  { label: 'Analytics', href: '/admin/analytics', description: 'Usage, revenue, and ATS trends' },
  { label: 'Platform settings', href: '/admin/settings', description: 'Limits, sessions, and 2FA policy' },
];

type SectionName = 'metrics' | 'trends' | 'activity' | 'alerts';

async function loadSection<T>(
  name: SectionName,
  fallback: T,
  loader: () => Promise<T>,
): Promise<{ data: T; error?: { section: SectionName; message: string } }> {
  try {
    return { data: await getOrSet(`admin:dashboard:v2:${name}`, CACHE_TTL.DASHBOARD_SUMMARY, loader) };
  } catch (error) {
    console.error(`[admin-dashboard] ${name} failed`, error);
    return { data: fallback, error: { section: name, message: `${name} data is temporarily unavailable.` } };
  }
}

async function loadMetrics(now: Date): Promise<DashboardMetricNumbers> {
  const startOfDay = startOfUtcDay(now);
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  const [
    totalUsers,
    activeSessions,
    totalResumes,
    aiCallsToday,
    openSecurityAlerts,
    newUsersThisMonth,
    newUsersLastMonth,
    revenue,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'USER' } }),
    prisma.session.findMany({
      where: { updatedAt: { gte: startOfDay }, user: { role: 'USER', isActive: true } },
      distinct: ['userId'],
      select: { userId: true },
    }),
    prisma.resume.count({ where: { disabledByAdmin: false } }),
    prisma.aiUsageEvent.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.securityAlert.count({ where: { status: 'OPEN' } }),
    prisma.user.count({ where: { role: 'USER', createdAt: { gte: startOfMonth } } }),
    prisma.user.count({ where: { role: 'USER', createdAt: { gte: startOfLastMonth, lt: startOfMonth } } }),
    envVars.STRIPE.STRIPE_ENABLED
      ? prisma.invoice.aggregate({
          where: { status: 'PAID', paidAt: { gte: startOfDay } },
          _sum: { amountPaid: true },
        })
      : Promise.resolve(null),
  ]);

  return {
    totalUsers,
    activeUsersToday: activeSessions.length,
    totalResumes,
    aiCallsToday,
    openSecurityAlerts,
    newUsersThisMonth,
    newUsersLastMonth,
    ...(revenue ? { revenueTodayMinor: revenue._sum.amountPaid ?? 0, currency: 'USD' } : {}),
  };
}

async function loadTrends(now: Date) {
  const since = startOfUtcDay(now);
  since.setUTCDate(since.getUTCDate() - 6);
  const [users, resumes, aiCalls] = await Promise.all([
    prisma.user.findMany({ where: { role: 'USER', createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.resume.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.aiUsageEvent.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
  ]);
  return buildSevenDayTrend(now, {
    users: users.map((item) => item.createdAt),
    resumes: resumes.map((item) => item.createdAt),
    aiCalls: aiCalls.map((item) => item.createdAt),
  });
}

async function loadActivity() {
  const [audit, users, resumes] = await Promise.all([
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
    prisma.user.findMany({
      where: { role: 'USER' }, orderBy: { createdAt: 'desc' }, take: 6,
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    }),
    prisma.resume.findMany({
      orderBy: { createdAt: 'desc' }, take: 6,
      select: { id: true, title: true, createdAt: true, user: { select: { id: true, name: true, role: true } } },
    }),
  ]);

  return [
    ...audit.map((item) => ({
      id: `audit-${item.id}`,
      actor: { id: item.actorId ?? 'system', name: item.actorEmail ?? 'System', role: 'ADMIN' as const },
      action: item.action.toLowerCase().replaceAll('_', ' '),
      target: item.entityId,
      createdAt: item.createdAt.toISOString(),
    })),
    ...users.map((item) => ({
      id: `signup-${item.id}`,
      actor: { id: item.id, name: item.name, role: item.role },
      action: 'signed up', target: item.email, createdAt: item.createdAt.toISOString(),
    })),
    ...resumes.map((item) => ({
      id: `resume-${item.id}`,
      actor: { id: item.user.id, name: item.user.name, role: item.user.role },
      action: 'created a resume', target: item.title, createdAt: item.createdAt.toISOString(),
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10);
}

async function loadAlerts() {
  const [alerts, maintenance] = await Promise.all([
    prisma.securityAlert.findMany({
      where: { status: 'OPEN' },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: 10,
    }),
    prisma.platformConfig.findUnique({ where: { key: 'maintenance_mode' } }),
  ]);
  const persisted = alerts.map((item) => ({
    id: item.id,
    level: item.severity.toLowerCase() as 'info' | 'warning' | 'critical',
    title: item.title,
    body: item.body,
    createdAt: item.createdAt.toISOString(),
  }));
  if (maintenance?.value === 'true') {
    persisted.unshift({
      id: 'maintenance-mode', level: 'critical', title: 'Maintenance mode is ON',
      body: 'All non-admin traffic may be unavailable.', createdAt: maintenance.updatedAt.toISOString(),
    });
  }
  return persisted;
}

export async function getDashboardStats() {
  const now = new Date();
  const emptyMetrics: DashboardMetricNumbers = {
    totalUsers: 0, activeUsersToday: 0, totalResumes: 0, aiCallsToday: 0,
    openSecurityAlerts: 0, newUsersThisMonth: 0, newUsersLastMonth: 0,
  };
  const [metrics, trends, activity, alerts] = await Promise.all([
    loadSection('metrics', emptyMetrics, () => loadMetrics(now)),
    loadSection('trends', [], () => loadTrends(now)),
    loadSection('activity', [], loadActivity),
    loadSection('alerts', [], loadAlerts),
  ]);

  return {
    totalUsers: metrics.data.totalUsers,
    activeUsersToday: metrics.data.activeUsersToday,
    totalResumes: metrics.data.totalResumes,
    aiCallsToday: metrics.data.aiCallsToday,
    openSecurityAlerts: metrics.data.openSecurityAlerts,
    stats: buildDashboardStats(metrics.data),
    trends: trends.data,
    activity: activity.data,
    alerts: alerts.data,
    quickLinks: QUICK_LINKS,
    errors: [metrics.error, trends.error, activity.error, alerts.error].filter(Boolean),
    generatedAt: now.toISOString(),
  };
}

export async function recordDashboardAccess(input: {
  actorId: string; actorEmail: string; ipAddress?: string; userAgent?: string;
}) {
  await Promise.allSettled([
    prisma.auditLog.create({
      data: {
        actorId: input.actorId, actorEmail: input.actorEmail,
        action: 'ADMIN_DASHBOARD_VIEW', entityType: 'ADMIN_DASHBOARD',
        ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
        ...(input.userAgent ? { userAgent: input.userAgent } : {}),
      },
    }),
    prisma.analyticsEvent.create({
      data: {
        name: 'admin_dashboard_view', path: '/admin',
        sessionId: `admin:${input.actorId}`, label: input.actorId,
      },
    }),
  ]);
}
