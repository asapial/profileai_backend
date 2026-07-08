import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import * as dashboardService from './dashboard.service';

export const getSummary = catchAsync(async (req: Request, res: Response) => {
  const data = await dashboardService.getDashboardSummary(req.user.userId);
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'Dashboard summary retrieved.',
    data,
  });
});
