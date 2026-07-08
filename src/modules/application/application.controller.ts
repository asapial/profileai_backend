import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import * as applicationService from './application.service';

const queryString = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : undefined;

export const list = catchAsync(async (req: Request, res: Response) => {
  const data = await applicationService.listApplications(req.user.userId, {
    ...(req.query.limit ? { limit: Number(req.query.limit) } : {}),
    ...(queryString(req.query.status) ? { status: queryString(req.query.status)! } : {}),
    ...(queryString(req.query.cursor) ? { cursor: queryString(req.query.cursor)! } : {}),
  });
  sendResponse(res, { status: status.OK, success: true, message: 'Applications retrieved.', data });
});

export const get = catchAsync(async (req: Request, res: Response) => {
  const data = await applicationService.getApplication(req.user.userId, queryString(req.params.id) ?? '');
  sendResponse(res, { status: status.OK, success: true, message: 'Application retrieved.', data });
});

export const create = catchAsync(async (req: Request, res: Response) => {
  const data = await applicationService.createApplication(req.user.userId, req.body);
  sendResponse(res, { status: status.CREATED, success: true, message: 'Application created.', data });
});

export const update = catchAsync(async (req: Request, res: Response) => {
  const data = await applicationService.updateApplication(req.user.userId, queryString(req.params.id) ?? '', req.body);
  sendResponse(res, { status: status.OK, success: true, message: 'Application updated.', data });
});

export const remove = catchAsync(async (req: Request, res: Response) => {
  const data = await applicationService.deleteApplication(req.user.userId, queryString(req.params.id) ?? '');
  sendResponse(res, { status: status.OK, success: true, message: 'Application deleted.', data });
});
