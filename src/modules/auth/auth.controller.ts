import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import { tokenUtils } from '../../utils/token';
import * as authService from './auth.service';

export const register = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.registerUser(req.body);
  sendResponse(res, {
    status: status.CREATED,
    success: true,
    message: 'Account created. Please check your email for the verification OTP.',
    data: result,
  });
});

export const verifyEmail = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.verifyEmail(req.body);
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

export const login = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.loginUser(req.body, req);

  if (result.twoFactorRequired) {
    return sendResponse(res, {
      status: status.OK,
      success: true,
      message: '2FA required. OTP sent to your email.',
      data: { twoFactorRequired: true, email: result.email },
    });
  }

  // Set cookies
  if (result.accessToken) tokenUtils.setAccessTokenCookie(res, result.accessToken);
  if (result.refreshToken) tokenUtils.setRefreshTokenCookie(res, result.refreshToken);

  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'Login successful.',
    data: { user: result.user, accessToken: result.accessToken },
  });
});

export const verifyTwoFactor = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.verifyTwoFactor(req.body, req);

  tokenUtils.setAccessTokenCookie(res, result.accessToken);
  tokenUtils.setRefreshTokenCookie(res, result.refreshToken);

  sendResponse(res, {
    status: status.OK,
    success: true,
    message: '2FA verification successful.',
    data: { user: result.user, accessToken: result.accessToken },
  });
});

export const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.forgotPassword(req.body.email);
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

export const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.resetPassword(req.body);
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

export const logout = catchAsync(async (req: Request, res: Response) => {
  const token = req.cookies?.accessToken || req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    await authService.logoutUser(token, req.user.userId);
  }

  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');

  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'Logged out successfully.',
    data: null,
  });
});

export const getMe = catchAsync(async (req: Request, res: Response) => {
  const user = await authService.getMe(req.user.userId);
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'Current user retrieved.',
    data: { user },
  });
});

export const resendOtp = catchAsync(async (req: Request, res: Response) => {
  const { email, type } = req.body;
  const result = await authService.resendOtp(email, type);
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

export const enable2FA = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.enable2FA(req.user.userId);
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

export const confirm2FA = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.confirm2FA(req.user.userId, req.body.otp);
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

export const disable2FA = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.disable2FA(req.user.userId, req.body.otp);
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: result.message,
    data: null,
  });
});
