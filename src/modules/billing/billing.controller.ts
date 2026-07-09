import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import {
  cancelAtPeriodEnd,
  createCheckoutSession,
  getCurrentSubscription,
  listInvoices,
  listPlans,
  openBillingPortal,
  previewCoupon,
} from './billing.service';

const plans = catchAsync(async (_req: Request, res: Response) => {
  const data = await listPlans();
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'Plans fetched.',
    data,
  });
});

const current = catchAsync(async (req: Request, res: Response) => {
  const data = await getCurrentSubscription(req.user!.userId);
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'Current subscription fetched.',
    data,
  });
});

const checkout = catchAsync(async (req: Request, res: Response) => {
  const email = req.user!.email;
  const data = await createCheckoutSession({
    userId: req.user!.userId,
    email,
    name: email.split('@')[0] ?? '',
    planSlug: req.body.planSlug as string,
    ...(req.body.couponCode
      ? { couponCode: req.body.couponCode as string }
      : {}),
  });
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'Checkout session created.',
    data,
  });
});

const portal = catchAsync(async (req: Request, res: Response) => {
  const email = req.user!.email;
  const data = await openBillingPortal(
    req.user!.userId,
    email,
    email.split('@')[0] ?? ''
  );
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'Billing portal URL minted.',
    data,
  });
});

const cancel = catchAsync(async (req: Request, res: Response) => {
  const data = await cancelAtPeriodEnd(req.user!.userId);
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'Subscription will cancel at period end.',
    data,
  });
});

const invoices = catchAsync(async (req: Request, res: Response) => {
  const data = await listInvoices(req.user!.userId);
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'Invoices fetched.',
    data,
  });
});

const couponPreview = catchAsync(async (req: Request, res: Response) => {
  const data = await previewCoupon(
    req.body.code as string,
    req.body.planSlug as string
  );
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'Coupon preview computed.',
    data,
  });
});

export const billingController = {
  plans,
  current,
  checkout,
  portal,
  cancel,
  invoices,
  couponPreview,
};