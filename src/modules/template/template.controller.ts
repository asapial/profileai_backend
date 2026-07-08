import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import * as templateService from './template.service';

export const listTemplates = catchAsync(async (req: Request, res: Response) => {
  const categoryRaw = req.query.category;
  const category = typeof categoryRaw === 'string' ? categoryRaw : undefined;

  const featuredRaw = req.query.featured;
  const featured = Array.isArray(featuredRaw)
    ? featuredRaw.some((value) => value === 'true' || value === '1')
    : typeof featuredRaw === 'string'
    ? featuredRaw === 'true' || featuredRaw === '1'
    : Boolean(featuredRaw);

  const data = await templateService.listTemplates({
    ...(category !== undefined ? { category } : {}),
    featured,
  });
  sendResponse(res, { status: status.OK, success: true, message: 'Templates retrieved.', data });
});

export const getTemplate = catchAsync(async (req: Request, res: Response) => {
  const data = await templateService.getTemplateById(String(req.params.id));
  sendResponse(res, { status: status.OK, success: true, message: 'Template retrieved.', data });
});

export const createTemplate = catchAsync(async (req: Request, res: Response) => {
  const data = await templateService.createTemplate(req.body, req.user.userId, req.file);
  sendResponse(res, { status: status.CREATED, success: true, message: 'Template created.', data });
});

export const updateTemplate = catchAsync(async (req: Request, res: Response) => {
  const data = await templateService.updateTemplate(String(req.params.id), req.body, req.file);
  sendResponse(res, { status: status.OK, success: true, message: 'Template updated.', data });
});

export const toggleStatus = catchAsync(async (req: Request, res: Response) => {
  const data = await templateService.toggleStatus(String(req.params.id));
  sendResponse(res, { status: status.OK, success: true, message: 'Template status toggled.', data });
});

export const setDefault = catchAsync(async (req: Request, res: Response) => {
  const data = await templateService.setDefault(String(req.params.id));
  sendResponse(res, { status: status.OK, success: true, message: 'Default template updated.', data });
});

export const deleteTemplate = catchAsync(async (req: Request, res: Response) => {
  const result = await templateService.deleteTemplate(String(req.params.id));
  sendResponse(res, { status: status.OK, success: true, message: result.message, data: null });
});
