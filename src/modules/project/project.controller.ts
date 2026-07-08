import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import * as projectService from './project.service';

const paramString = (v: unknown): string => (typeof v === 'string' ? v : '');

export const list = catchAsync(async (req: Request, res: Response) => {
  const data = await projectService.listProjects(req.user.userId);
  sendResponse(res, { status: status.OK, success: true, message: 'Projects retrieved.', data });
});

export const get = catchAsync(async (req: Request, res: Response) => {
  const data = await projectService.getProject(req.user.userId, paramString(req.params.id));
  sendResponse(res, { status: status.OK, success: true, message: 'Project retrieved.', data });
});

export const create = catchAsync(async (req: Request, res: Response) => {
  const data = await projectService.createProject(req.user.userId, req.body);
  sendResponse(res, { status: status.CREATED, success: true, message: 'Project created.', data });
});

export const update = catchAsync(async (req: Request, res: Response) => {
  const data = await projectService.updateProject(req.user.userId, paramString(req.params.id), req.body);
  sendResponse(res, { status: status.OK, success: true, message: 'Project updated.', data });
});

export const remove = catchAsync(async (req: Request, res: Response) => {
  const data = await projectService.deleteProject(req.user.userId, paramString(req.params.id));
  sendResponse(res, { status: status.OK, success: true, message: 'Project deleted.', data });
});
