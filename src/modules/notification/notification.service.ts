import status from 'http-status';
import { prisma } from '../../lib/prisma';
import { bustDashboardCache } from '../dashboard/dashboard.service';
import AppError from '../../errorHelpers/AppError';

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
  return updated;
};

export const markAllRead = async (userId: string) => {
  const result = await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
  await bustDashboardCache(userId);
  return { updated: result.count };
};

export const deleteNotification = async (userId: string, id: string) => {
  const existing = await prisma.notification.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError(status.NOT_FOUND, 'Notification not found.');

  await prisma.notification.delete({ where: { id } });
  await bustDashboardCache(userId);
  return { id };
};
