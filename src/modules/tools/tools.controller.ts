import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import * as toolsService from './tools.service';

export const analyzeJd = catchAsync(async (req: Request, res: Response) => {
  const data = await toolsService.analyzeJd(req.user.userId, req.body);
  sendResponse(res, { status: status.OK, success: true, message: 'JD analyzed.', data });
});
