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

  const documentTypeRaw = req.query.documentType;
  const documentType = typeof documentTypeRaw === 'string' ? documentTypeRaw : undefined;

  const data = await templateService.listTemplates({
    ...(category !== undefined ? { category } : {}),
    ...(documentType !== undefined ? { documentType } : {}),
    featured,
  });
  sendResponse(res, { status: status.OK, success: true, message: 'Templates retrieved.', data });
});

export const listMyTemplates = catchAsync(async (req: Request, res: Response) => {
  const data = await templateService.listUserTemplates(req.user.userId);
  sendResponse(res, { status: status.OK, success: true, message: 'Your template gallery was retrieved.', data });
});

export const forkMyTemplate = catchAsync(async (req: Request, res: Response) => {
  const data = await templateService.forkUserTemplate(req.user.userId, req.body);
  sendResponse(res, { status: status.CREATED, success: true, message: 'Editable template saved to your gallery.', data });
});

export const updateMyTemplate = catchAsync(async (req: Request, res: Response) => {
  const data = await templateService.updateUserTemplate(req.user.userId, String(req.params.id), req.body);
  sendResponse(res, { status: status.OK, success: true, message: 'Template changes saved.', data });
});

export const submitMyTemplate = catchAsync(async (req: Request, res: Response) => {
  const data = await templateService.submitUserTemplate(req.user.userId, String(req.params.id));
  sendResponse(res, { status: status.OK, success: true, message: 'Template submitted for admin review.', data });
});

export const deleteMyTemplate = catchAsync(async (req: Request, res: Response) => {
  const data = await templateService.deleteUserTemplate(req.user.userId, String(req.params.id));
  sendResponse(res, { status: status.OK, success: true, message: data.status === 'archived' ? 'Template archived because a resume uses it.' : 'Template deleted.', data });
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
