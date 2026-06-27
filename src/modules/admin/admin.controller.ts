import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import * as adminService from './admin.service';

export const getDashboard = catchAsync(async (_req: Request, res: Response) => {
  const data = await adminService.getDashboardStats();
  sendResponse(res, { status: status.OK, success: true, message: 'Dashboard stats retrieved.', data });
});

export const listUsers = catchAsync(async (req: Request, res: Response) => {
  const { page = '1', limit = '20', search, role, status: statusFilter } = req.query;
  const result = await adminService.listUsers(
    parseInt(page as string),
    parseInt(limit as string),
    search as string,
    role as string,
    statusFilter as string
  );
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'Users retrieved.',
    data: result.users,
    meta: result.meta,
  });
});

export const getUserById = catchAsync(async (req: Request, res: Response) => {
  const data = await adminService.getUserById(req.params.id);
  sendResponse(res, { status: status.OK, success: true, message: 'User retrieved.', data });
});

export const updateUserLimits = catchAsync(async (req: Request, res: Response) => {
  const { resumeLimit, apiLimit } = req.body;
  const data = await adminService.updateUserLimits(req.params.id, resumeLimit, apiLimit);
  sendResponse(res, { status: status.OK, success: true, message: 'User limits updated.', data });
});

export const toggleUserStatus = catchAsync(async (req: Request, res: Response) => {
  const { isActive } = req.body;
  const data = await adminService.toggleUserStatus(req.params.id, isActive);
  sendResponse(res, { status: status.OK, success: true, message: `User ${isActive ? 'activated' : 'banned'}.`, data });
});

export const deleteUser = catchAsync(async (req: Request, res: Response) => {
  const result = await adminService.deleteUser(req.params.id);
  sendResponse(res, { status: status.OK, success: true, message: result.message, data: null });
});

export const getSettings = catchAsync(async (_req: Request, res: Response) => {
  const data = await adminService.getSettings();
  sendResponse(res, { status: status.OK, success: true, message: 'Settings retrieved.', data });
});

export const updateSettings = catchAsync(async (req: Request, res: Response) => {
  const data = await adminService.updateSettings(req.body.settings, req.user.userId);
  sendResponse(res, { status: status.OK, success: true, message: 'Settings updated.', data });
});

export const getAnalytics = catchAsync(async (req: Request, res: Response) => {
  const { from, to } = req.query;
  const fromDate = from ? new Date(from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const toDate = to ? new Date(to as string) : new Date();
  const data = await adminService.getAnalytics(fromDate, toDate);
  sendResponse(res, { status: status.OK, success: true, message: 'Analytics retrieved.', data });
});
