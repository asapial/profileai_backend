import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import * as userService from './user.service';

export const getProfile = catchAsync(async (req: Request, res: Response) => {
  const data = await userService.getProfile(req.user.userId);
  sendResponse(res, { status: status.OK, success: true, message: 'Profile retrieved.', data });
});

export const updateProfile = catchAsync(async (req: Request, res: Response) => {
  const data = await userService.updateProfile(req.user.userId, req.body);
  sendResponse(res, { status: status.OK, success: true, message: 'Profile updated.', data });
});

export const uploadAvatar = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    return sendResponse(res, {
      status: status.BAD_REQUEST,
      success: false,
      message: 'No file uploaded.',
      data: null,
    });
  }
  const url = await userService.uploadAvatar(
    req.user.userId,
    req.file.buffer,
    req.file.mimetype,
    req.file.originalname
  );
  sendResponse(res, { status: status.OK, success: true, message: 'Avatar uploaded.', data: { avatarUrl: url } });
});

export const changePassword = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.changePassword(req.user.userId, req.body);
  sendResponse(res, { status: status.OK, success: true, message: result.message, data: null });
});

export const getDevices = catchAsync(async (req: Request, res: Response) => {
  const token = req.cookies?.accessToken || '';
  const data = await userService.getDevices(req.user.userId, token);
  sendResponse(res, { status: status.OK, success: true, message: 'Devices retrieved.', data });
});

export const revokeDevice = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.revokeDevice(req.user.userId, req.params.id);
  sendResponse(res, { status: status.OK, success: true, message: result.message, data: null });
});

export const getLimits = catchAsync(async (req: Request, res: Response) => {
  const data = await userService.getUserLimits(req.user.userId);
  sendResponse(res, { status: status.OK, success: true, message: 'Limits retrieved.', data });
});
