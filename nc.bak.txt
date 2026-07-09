import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import * as notificationService from './notification.service';

const queryString = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : undefined;

export const list = catchAsync(async (req: Request, res: Response) => {
  const data = await notificationService.listNotifications(req.user.userId, {
    ...(req.query.limit ? { limit: Number(req.query.limit) } : {}),
    unreadOnly: req.query.unread === 'true',
    ...(queryString(req.query.cursor) ? { cursor: queryString(req.query.cursor)! } : {}),
  });
  sendResponse(res, { status: status.OK, success: true, message: 'Notifications retrieved.', data });
});

export const markRead = catchAsync(async (req: Request, res: Response) => {
  const data = await notificationService.markRead(req.user.userId, queryString(req.params.id) ?? '');
  sendResponse(res, { status: status.OK, success: true, message: 'Notification marked as read.', data });
});

export const markAllRead = catchAsync(async (req: Request, res: Response) => {
  const data = await notificationService.markAllRead(req.user.userId);
  sendResponse(res, { status: status.OK, success: true, message: 'All notifications marked as read.', data });
});

export const remove = catchAsync(async (req: Request, res: Response) => {
  const data = await notificationService.deleteNotification(req.user.userId, queryString(req.params.id) ?? '');
  sendResponse(res, { status: status.OK, success: true, message: 'Notification deleted.', data });
});
