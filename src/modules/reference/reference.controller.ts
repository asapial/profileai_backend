import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import * as referenceService from './reference.service';

const paramString = (v: unknown): string => (typeof v === 'string' ? v : '');

export const list = catchAsync(async (req: Request, res: Response) => {
  const data = await referenceService.listReferences(req.user.userId);
  sendResponse(res, { status: status.OK, success: true, message: 'References retrieved.', data });
});

export const get = catchAsync(async (req: Request, res: Response) => {
  const data = await referenceService.getReference(req.user.userId, paramString(req.params.id));
  sendResponse(res, { status: status.OK, success: true, message: 'Reference retrieved.', data });
});

export const create = catchAsync(async (req: Request, res: Response) => {
  const data = await referenceService.createReference(req.user.userId, req.body);
  sendResponse(res, { status: status.CREATED, success: true, message: 'Reference created.', data });
});

export const update = catchAsync(async (req: Request, res: Response) => {
  const data = await referenceService.updateReference(req.user.userId, paramString(req.params.id), req.body);
  sendResponse(res, { status: status.OK, success: true, message: 'Reference updated.', data });
});

export const remove = catchAsync(async (req: Request, res: Response) => {
  const data = await referenceService.deleteReference(req.user.userId, paramString(req.params.id));
  sendResponse(res, { status: status.OK, success: true, message: 'Reference deleted.', data });
});
