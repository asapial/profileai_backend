import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import {
  generateLink,
  getLeaderboard,
  getReferralOverview,
  getRewards,
} from './referral.service';

const overview = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const data = await getReferralOverview(userId);
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'Referral overview fetched.',
    data,
  });
});

const generate = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const data = await generateLink(userId);
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'Referral link generated.',
    data,
  });
});

const rewards = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const data = await getRewards(userId);
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'Rewards fetched.',
    data,
  });
});

const leaderboard = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const data = await getLeaderboard(userId);
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'Leaderboard fetched.',
    data,
  });
});

export const referralController = { overview, generate, rewards, leaderboard };