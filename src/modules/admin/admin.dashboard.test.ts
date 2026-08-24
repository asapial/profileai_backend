import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDashboardStats, buildSevenDayTrend, startOfUtcDay } from './admin.dashboard';

test('startOfUtcDay normalizes without depending on server timezone', () => {
  assert.equal(startOfUtcDay(new Date('2026-07-12T23:45:00+06:00')).toISOString(), '2026-07-12T00:00:00.000Z');
});

test('buildSevenDayTrend returns complete ordered buckets and counts events', () => {
  const trend = buildSevenDayTrend(new Date('2026-07-12T18:00:00Z'), {
    users: [new Date('2026-07-06T01:00:00Z'), new Date('2026-07-12T09:00:00Z')],
    resumes: [new Date('2026-07-12T10:00:00Z')],
    aiCalls: [new Date('2026-07-11T10:00:00Z'), new Date('2026-07-11T11:00:00Z')],
  });
  assert.equal(trend.length, 7);
  assert.deepEqual(trend.map((point) => point.date), [
    '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09',
    '2026-07-10', '2026-07-11', '2026-07-12',
  ]);
  assert.equal(trend[0]?.users, 1);
  assert.equal(trend[5]?.aiCalls, 2);
  assert.equal(trend[6]?.resumes, 1);
});

test('buildDashboardStats keeps the three primary operational metrics first', () => {
  const stats = buildDashboardStats({
    totalUsers: 120,
    activeUsersToday: 14,
    totalResumes: 350,
    aiCallsToday: 48,
    openSecurityAlerts: 2,
    newUsersThisMonth: 20,
    newUsersLastMonth: 10,
  });
  assert.deepEqual(stats.slice(0, 3).map((stat) => stat.key), ['users', 'resumes', 'ai-calls']);
  assert.equal(stats.find((stat) => stat.key === 'security-alerts')?.trend, 'down');
});

test('buildDashboardStats adds revenue only when billing supplies it', () => {
  const stats = buildDashboardStats({
    totalUsers: 0, activeUsersToday: 0, totalResumes: 0, aiCallsToday: 0,
    openSecurityAlerts: 0, newUsersThisMonth: 0, newUsersLastMonth: 0,
    revenueTodayMinor: 12500, currency: 'USD',
  });
  assert.equal(stats.at(-1)?.format, 'currency');
  assert.equal(stats.at(-1)?.value, 12500);
});
