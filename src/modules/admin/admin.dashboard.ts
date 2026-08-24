export type DashboardMetricNumbers = {
  totalUsers: number;
  activeUsersToday: number;
  totalResumes: number;
  aiCallsToday: number;
  openSecurityAlerts: number;
  revenueTodayMinor?: number;
  currency?: string;
  newUsersThisMonth: number;
  newUsersLastMonth: number;
};

export type DashboardTrendPoint = {
  date: string;
  label: string;
  users: number;
  resumes: number;
  aiCalls: number;
};

const utcDayKey = (date: Date) => date.toISOString().slice(0, 10);

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function buildDashboardStats(metrics: DashboardMetricNumbers) {
  const monthDelta = metrics.newUsersLastMonth > 0
    ? Math.round(((metrics.newUsersThisMonth - metrics.newUsersLastMonth) / metrics.newUsersLastMonth) * 100)
    : metrics.newUsersThisMonth > 0 ? 100 : 0;

  const stats: Array<{
    key: string;
    label: string;
    value: number;
    hint: string;
    trend: 'up' | 'down' | 'flat';
    format?: 'number' | 'currency';
    currency?: string;
  }> = [
    {
      key: 'users',
      label: 'Total users',
      value: metrics.totalUsers,
      hint: `${metrics.activeUsersToday.toLocaleString()} active today`,
      trend: monthDelta > 0 ? 'up' : monthDelta < 0 ? 'down' : 'flat',
    },
    {
      key: 'resumes',
      label: 'Active resumes',
      value: metrics.totalResumes,
      hint: 'Available to users',
      trend: 'flat',
    },
    {
      key: 'ai-calls',
      label: 'AI calls today',
      value: metrics.aiCallsToday,
      hint: 'Successful operations',
      trend: 'flat',
    },
    {
      key: 'security-alerts',
      label: 'Open security alerts',
      value: metrics.openSecurityAlerts,
      hint: metrics.openSecurityAlerts === 0 ? 'No open incidents' : 'Requires review',
      trend: metrics.openSecurityAlerts > 0 ? 'down' : 'flat',
    },
  ];

  if (metrics.revenueTodayMinor !== undefined) {
    stats.push({
      key: 'revenue',
      label: 'Revenue today',
      value: metrics.revenueTodayMinor,
      hint: 'Paid invoices',
      trend: 'flat',
      format: 'currency',
      currency: metrics.currency ?? 'USD',
    });
  }

  return stats;
}

export function buildSevenDayTrend(
  now: Date,
  input: { users: Date[]; resumes: Date[]; aiCalls: Date[] },
): DashboardTrendPoint[] {
  const end = startOfUtcDay(now);
  const points = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (6 - index));
    return {
      date: utcDayKey(date),
      label: date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      users: 0,
      resumes: 0,
      aiCalls: 0,
    };
  });
  const byDate = new Map(points.map((point) => [point.date, point]));

  for (const date of input.users) {
    const point = byDate.get(utcDayKey(date));
    if (point) point.users += 1;
  }
  for (const date of input.resumes) {
    const point = byDate.get(utcDayKey(date));
    if (point) point.resumes += 1;
  }
  for (const date of input.aiCalls) {
    const point = byDate.get(utcDayKey(date));
    if (point) point.aiCalls += 1;
  }

  return points;
}
