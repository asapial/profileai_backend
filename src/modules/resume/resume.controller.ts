import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import * as resumeService from './resume.service';

export const listResumes = catchAsync(async (req: Request, res: Response) => {
  const { page = '1', limit = '10', type, status: resumeStatus } = req.query;
  const result = await resumeService.listResumes(
    req.user.userId,
    parseInt(page as string),
    parseInt(limit as string),
    type as string,
    resumeStatus as string
  );
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'Resumes retrieved.',
    data: result.resumes,
    meta: result.meta,
  });
});

export const getResume = catchAsync(async (req: Request, res: Response) => {
  const data = await resumeService.getResume(req.user.userId, String(req.params.id));
  sendResponse(res, { status: status.OK, success: true, message: 'Resume retrieved.', data });
});

export const generateResume = catchAsync(async (req: Request, res: Response) => {
  const data = await resumeService.generateResume(req.user.userId, req.body);
  sendResponse(res, { status: status.CREATED, success: true, message: 'Resume generated successfully.', data });
});

export const updateResume = catchAsync(async (req: Request, res: Response) => {
  const data = await resumeService.updateResume(req.user.userId, String(req.params.id), req.body);
  sendResponse(res, { status: status.OK, success: true, message: 'Resume updated.', data });
});

export const deleteResume = catchAsync(async (req: Request, res: Response) => {
  const result = await resumeService.deleteResume(req.user.userId, String(req.params.id));
  sendResponse(res, { status: status.OK, success: true, message: result.message, data: null });
});

export const atsCheck = catchAsync(async (req: Request, res: Response) => {
  const data = await resumeService.runAtsCheck(req.user.userId, String(req.params.id), req.body);
  sendResponse(res, { status: status.OK, success: true, message: 'ATS analysis complete.', data });
});

export const exportPdf = catchAsync(async (req: Request, res: Response) => {
  const format = (req.body.format as 'A4' | 'Letter') || 'A4';
  const data = await resumeService.exportPdf(req.user.userId, String(req.params.id), format);
  sendResponse(res, { status: status.OK, success: true, message: 'PDF exported.', data });
});

export const getHistory = catchAsync(async (req: Request, res: Response) => {
  const data = await resumeService.getResumeHistory(req.user.userId, String(req.params.id));
  sendResponse(res, { status: status.OK, success: true, message: 'History retrieved.', data });
});

export const restoreVersion = catchAsync(async (req: Request, res: Response) => {
  const data = await resumeService.restoreVersion(req.user.userId, String(req.params.id), parseInt(String(req.params.version)));
  sendResponse(res, { status: status.OK, success: true, message: 'Version restored.', data });
});

export const duplicateResume = catchAsync(async (req: Request, res: Response) => {
  const data = await resumeService.duplicateResume(req.user.userId, String(req.params.id));
  sendResponse(res, { status: status.CREATED, success: true, message: 'Resume duplicated.', data });
});

export const aiModifySection = catchAsync(async (req: Request, res: Response) => {
  const data = await resumeService.aiModifySection(req.user.userId, String(req.params.id), req.body);
  sendResponse(res, { status: status.OK, success: true, message: 'Section updated by AI.', data });
});
