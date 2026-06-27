import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import * as templateService from './template.service';

export const listTemplates = catchAsync(async (req: Request, res: Response) => {
  const data = await templateService.listTemplates(req.query.category as string);
  sendResponse(res, { status: status.OK, success: true, message: 'Templates retrieved.', data });
});

export const getTemplate = catchAsync(async (req: Request, res: Response) => {
  const data = await templateService.getTemplateById(req.params.id);
  sendResponse(res, { status: status.OK, success: true, message: 'Template retrieved.', data });
});

export const createTemplate = catchAsync(async (req: Request, res: Response) => {
  const data = await templateService.createTemplate(req.body, req.user.userId, req.file);
  sendResponse(res, { status: status.CREATED, success: true, message: 'Template created.', data });
});

export const updateTemplate = catchAsync(async (req: Request, res: Response) => {
  const data = await templateService.updateTemplate(req.params.id, req.body, req.file);
  sendResponse(res, { status: status.OK, success: true, message: 'Template updated.', data });
});

export const toggleStatus = catchAsync(async (req: Request, res: Response) => {
  const data = await templateService.toggleStatus(req.params.id);
  sendResponse(res, { status: status.OK, success: true, message: 'Template status toggled.', data });
});

export const setDefault = catchAsync(async (req: Request, res: Response) => {
  const data = await templateService.setDefault(req.params.id);
  sendResponse(res, { status: status.OK, success: true, message: 'Default template updated.', data });
});

export const deleteTemplate = catchAsync(async (req: Request, res: Response) => {
  const result = await templateService.deleteTemplate(req.params.id);
  sendResponse(res, { status: status.OK, success: true, message: result.message, data: null });
});
