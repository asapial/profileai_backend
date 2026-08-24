import status from 'http-status';
import { prisma } from '../../lib/prisma';
import { bustDashboardCache } from '../dashboard/dashboard.service';
import AppError from '../../errorHelpers/AppError';
import { notificationGateway } from './notification.gateway';

export interface ListNotificationsInput {
  limit?: number;
  unreadOnly?: boolean;
  cursor?: string;
}

export const listNotifications = async (userId: string, input: ListNotificationsInput) => {
  const { limit = 20, unreadOnly = false, cursor } = input;
  const take = Math.min(Math.max(limit, 1), 100);

  const where = {
    userId,
    ...(unreadOnly ? { read: false } : {}),
  };

  const items = await prisma.notification.findMany({
    where,
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
  });

  let nextCursor: string | null = null;
  if (items.length > take) {
    const next = items.pop()!;
    nextCursor = next.id;
  }

  const unreadCount = await prisma.notification.count({
    where: { userId, read: false },
  });

  return { items, nextCursor, unreadCount };
};

export const markRead = async (userId: string, id: string) => {
  const existing = await prisma.notification.findFirst({
    where: { id, userId },
  });
  if (!existing) throw new AppError(status.NOT_FOUND, 'Notification not found.');

  const updated = await prisma.notification.update({
    where: { id },
    data: { read: true },
  });
  await bustDashboardCache(userId);
  notificationGateway.toUser(userId, {
    event: 'notification.changed',
    data: { id, unreadCount: await prisma.notification.count({ where: { userId, read: false } }) },
  });
  return updated;
};

export const markAllRead = async (userId: string) => {
  const result = await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
  await bustDashboardCache(userId);
  notificationGateway.toUser(userId, {
    event: 'notification.changed',
    data: { unreadCount: 0 },
  });
  return { updated: result.count };
};

export const deleteNotification = async (userId: string, id: string) => {
  const existing = await prisma.notification.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError(status.NOT_FOUND, 'Notification not found.');

  await prisma.notification.delete({ where: { id } });
  await bustDashboardCache(userId);
  notificationGateway.toUser(userId, {
    event: 'notification.changed',
    data: { id, unreadCount: await prisma.notification.count({ where: { userId, read: false } }) },
  });
  return { id };
};

// ─── Dispatcher helper ──────────────────────────────────────────────────────
// Single entry point every other module should use to surface in-app activity
// (resume exports finishing, application status changes, billing alerts,
// etc.). It wraps the row insert + cache bust so callers don't have to
// remember either step — and crucially, fails silently (logs only) so a
// notification failure can never block the parent business operation.
export interface CreateNotificationInput {
  userId: string;
  type:
    | 'SYSTEM'
    | 'RESUME'
    | 'APPLICATION'
    | 'BILLING'
    | 'SECURITY';
  title: string;
  body?: string | null;
  link?: string | null;
}

export const createNotification = async (
  input: CreateNotificationInput
): Promise<void> => {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        read: false,
      },
    });
    await bustDashboardCache(input.userId);
    notificationGateway.toUser(input.userId, {
      event: 'notification.created',
      data: notification as unknown as Record<string, unknown>,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notification] createNotification failed:', err);
    // Never propagate — notifications are best-effort UX, not business
    // state. The parent write should succeed even if this side-effect
    // throws.
  }
};

export const createRoleNotification = async (
  role: 'ADMIN' | 'USER',
  input: Omit<CreateNotificationInput, 'userId'>,
): Promise<number> => {
  const users = await prisma.user.findMany({
    where: { role, isActive: true },
    select: { id: true },
  });
  if (users.length === 0) return 0;
  await prisma.notification.createMany({
    data: users.map((user) => ({
      userId: user.id,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      read: false,
    })),
  });
  notificationGateway.toRole(role, {
    event: 'notification.created',
    data: {
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      role,
    },
  });
  await Promise.all(users.map((user) => bustDashboardCache(user.id)));
  return users.length;
};

export const getUnreadCount = async (
  userId: string
): Promise<{ unreadCount: number }> => {
  const unreadCount = await prisma.notification.count({
    where: { userId, read: false },
  });
  return { unreadCount };
};
