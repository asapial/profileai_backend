import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import * as coverLetterService from './coverLetter.service';

const paramString = (v: unknown): string => (typeof v === 'string' ? v : '');

export const list = catchAsync(async (req: Request, res: Response) => {
  const data = await coverLetterService.listCoverLetters(req.user.userId, {
    ...(req.query.limit ? { limit: Number(req.query.limit) } : {}),
    ...(typeof req.query.cursor === 'string' ? { cursor: req.query.cursor } : {}),
    ...(typeof req.query.search === 'string' ? { search: req.query.search } : {}),
  });
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'Cover letters retrieved.',
    data,
  });
});

export const get = catchAsync(async (req: Request, res: Response) => {
  const data = await coverLetterService.getCoverLetter(
    req.user.userId,
    paramString(req.params.id),
  );
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'Cover letter retrieved.',
    data,
  });
});

export const create = catchAsync(async (req: Request, res: Response) => {
  const data = await coverLetterService.createCoverLetter(
    req.user.userId,
    req.body,
  );
  sendResponse(res, {
    status: status.CREATED,
    success: true,
    message: 'Cover letter created.',
    data,
  });
});

export const update = catchAsync(async (req: Request, res: Response) => {
  const data = await coverLetterService.updateCoverLetter(
    req.user.userId,
    paramString(req.params.id),
    req.body,
  );
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'Cover letter updated.',
    data,
  });
});

export const remove = catchAsync(async (req: Request, res: Response) => {
  const data = await coverLetterService.deleteCoverLetter(
    req.user.userId,
    paramString(req.params.id),
  );
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'Cover letter deleted.',
    data,
  });
});

export const regenerate = catchAsync(async (req: Request, res: Response) => {
  const data = await coverLetterService.regenerateCoverLetter(
    req.user.userId,
    paramString(req.params.id),
    req.body,
  );
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'Cover letter regenerated.',
    data,
  });
});

export const exportPdf = catchAsync(async (req: Request, res: Response) => {
  const data = await coverLetterService.exportCoverLetterPdf(
    req.user.userId,
    paramString(req.params.id),
  );
  sendResponse(res, {
    status: status.ACCEPTED,
    success: true,
    message: 'Cover letter export queued.',
    data,
  });
});