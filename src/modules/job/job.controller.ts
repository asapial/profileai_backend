import type { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import * as jobService from './job.service';

const text = (value: unknown) => typeof value === 'string' ? value : '';
export const list = catchAsync(async (req: Request, res: Response) => {
  const lifecycle = text(req.query.lifecycle);
  const query = text(req.query.query);
  const data = await jobService.listJobs(req.user.userId, {
    ...(lifecycle ? { lifecycle } : {}),
    ...(query ? { query } : {}),
    ...(req.query.limit ? { limit: Number(req.query.limit) } : {}),
  });
  sendResponse(res, { status: status.OK, success: true, message: 'Jobs retrieved.', data });
});
export const get = catchAsync(async (req: Request, res: Response) => {
  const data = await jobService.getJob(req.user.userId, text(req.params.id));
  sendResponse(res, { status: status.OK, success: true, message: 'Job retrieved.', data });
});
export const create = catchAsync(async (req: Request, res: Response) => {
  const data = await jobService.createJob(req.user.userId, req.body);
  sendResponse(res, { status: status.CREATED, success: true, message: 'Job added to workspace.', data });
});
export const update = catchAsync(async (req: Request, res: Response) => {
  const data = await jobService.updateJob(req.user.userId, text(req.params.id), req.body);
  sendResponse(res, { status: status.OK, success: true, message: 'Job updated.', data });
});
export const remove = catchAsync(async (req: Request, res: Response) => {
  const data = await jobService.deleteJob(req.user.userId, text(req.params.id));
  sendResponse(res, { status: status.OK, success: true, message: 'Job removed.', data });
});
export const createApplication = catchAsync(async (req: Request, res: Response) => {
  const data = await jobService.createApplicationFromJob(req.user.userId, text(req.params.id), req.body);
  sendResponse(res, { status: status.CREATED, success: true, message: 'Job added to application tracker.', data });
});
