import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import * as exportService from './export.service';

const paramString = (v: unknown): string => (typeof v === 'string' ? v : '');

export const requestUserExport = catchAsync(async (req: Request, res: Response) => {
  const data = await exportService.enqueueUserExport(req.user.userId);
  sendResponse(res, { status: status.ACCEPTED, success: true, message: 'Export queued.', data });
});

export const requestResumeExport = catchAsync(async (req: Request, res: Response) => {
  const data = await exportService.enqueueResumeExport(req.user.userId, paramString(req.params.id));
  sendResponse(res, { status: status.ACCEPTED, success: true, message: 'Resume export queued.', data });
});

export const list = catchAsync(async (req: Request, res: Response) => {
  const data = await exportService.listExportJobs(
    req.user.userId,
    req.query.limit ? Number(req.query.limit) : 20,
  );
  sendResponse(res, { status: status.OK, success: true, message: 'Export jobs retrieved.', data });
});

export const get = catchAsync(async (req: Request, res: Response) => {
  const data = await exportService.getExportJob(req.user.userId, paramString(req.params.id));
  sendResponse(res, { status: status.OK, success: true, message: 'Export job retrieved.', data });
});
