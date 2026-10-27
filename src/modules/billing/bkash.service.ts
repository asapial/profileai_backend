import { randomUUID } from 'node:crypto';
import { Prisma } from '../../../prisma/generated/prisma/client';
import { envVars } from '../../config/env';
import AppError from '../../errorHelpers/AppError';
import { prisma } from '../../lib/prisma';
import { bustDashboardCache } from '../dashboard/dashboard.service';
import { createNotification } from '../notification/notification.service';
import { bkashClient } from './bkash.client';

type BillingChoice = 'monthly' | 'yearly';

const yearlyAmount = (monthlyAmount: number): number => monthlyAmount * 10;

const frontendBillingUrl = (result: 'success' | 'cancel' | 'failure') =>
  `${envVars.FRONTEND_URL.replace(/\/+$/, '')}/dashboard/billing?payment=${result}`;

export async function createBkashCheckout(input: {
  userId: string;
  planSlug: string;
  billing: BillingChoice;
  couponCode?: string;
}): Promise<{ url: string; provider: 'bkash' }> {
  const plan = await prisma.plan.findUnique({ where: { slug: input.planSlug } });
  if (!plan || !plan.isActive || plan.amount <= 0) throw new AppError(404, 'Paid plan not found.');
  if (plan.currency.toLowerCase() !== 'bdt') throw new AppError(400, 'bKash requires a BDT plan.');

  let amount = input.billing === 'yearly' ? yearlyAmount(plan.amount) : plan.amount;
  if (amount === null) throw new AppError(400, 'Yearly billing is not available for this plan.');

  let couponId: string | null = null;
  if (input.couponCode) {
    const coupon = await prisma.coupon.findUnique({ where: { code: input.couponCode.trim().toUpperCase() } });
    const usable = coupon?.isActive && (!coupon.expiresAt || coupon.expiresAt > new Date()) &&
      (!coupon.maxRedemptions || coupon.redeemed < coupon.maxRedemptions);
    if (!usable || !coupon) throw new AppError(400, 'Coupon is invalid or expired.');
    if (coupon.percentOff) amount = Math.round(amount * (100 - coupon.percentOff) / 100);
    else if (coupon.amountOff) amount = Math.max(0, amount - coupon.amountOff);
    couponId = coupon.id;
  }
  if (amount < 100) throw new AppError(400, 'Payment amount is below the supported minimum.');

  const merchantInvoiceNumber = `PAI-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const pending = await prisma.bkashPayment.create({
    data: {
      userId: input.userId,
      planId: plan.id,
      billingInterval: input.billing === 'yearly' ? 'YEAR' : 'MONTH',
      merchantInvoiceNumber,
      amount,
      expiresAt: new Date(Date.now() + 20 * 60 * 1000),
      ...(couponId ? { providerPayload: { couponId } } : {}),
    },
  });

  const callbackURL = `${envVars.BETTER_AUTH_URL.replace(/\/+$/, '')}/api/v1/billing/bkash/callback`;
  try {
    const response = await bkashClient.createPayment({
      mode: '0011',
      payerReference: input.userId,
      callbackURL,
      amount: (amount / 100).toFixed(2),
      currency: 'BDT',
      intent: 'sale',
      merchantInvoiceNumber,
    });
    const paymentId = String(response.paymentID ?? '');
    const url = String(response.bkashURL ?? '');
    if (!paymentId || !url || String(response.statusCode ?? '0000') !== '0000') {
      throw new AppError(502, String(response.statusMessage ?? 'bKash did not create the payment.'));
    }
    await prisma.bkashPayment.update({
      where: { id: pending.id },
      data: { paymentId, providerPayload: { ...response, ...(couponId ? { couponId } : {}) } },
    });
    return { url, provider: 'bkash' };
  } catch (error) {
    await prisma.bkashPayment.update({
      where: { id: pending.id },
      data: { status: 'CREATE_FAILED', providerPayload: { message: error instanceof Error ? error.message : 'Unknown error' } },
    });
    throw error;
  }
}

export async function completeBkashCallback(paymentID: string, callbackStatus: string) {
  const payment = await prisma.bkashPayment.findUnique({
    where: { paymentId: paymentID },
    include: { plan: true },
  });
  if (!payment) return { redirect: frontendBillingUrl('failure') };
  if (payment.status === 'COMPLETED') return { redirect: frontendBillingUrl('success') };
  if (callbackStatus === 'cancel') {
    await prisma.bkashPayment.update({ where: { id: payment.id }, data: { status: 'CANCELED' } });
    return { redirect: frontendBillingUrl('cancel') };
  }
  if (callbackStatus !== 'success' || payment.expiresAt < new Date()) {
    await prisma.bkashPayment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    return { redirect: frontendBillingUrl('failure') };
  }

  let provider = await bkashClient.executePayment(paymentID);
  if (String(provider.transactionStatus ?? '').toLowerCase() !== 'completed') {
    provider = await bkashClient.queryPayment(paymentID);
  }
  const completed = String(provider.transactionStatus ?? '').toLowerCase() === 'completed';
  const providerAmount = Math.round(Number(provider.amount ?? 0) * 100);
  const currency = String(provider.currency ?? '').toUpperCase();
  const trxId = String(provider.trxID ?? '');
  if (!completed || String(provider.statusCode ?? '0000') !== '0000' || providerAmount !== payment.amount || currency !== 'BDT' || !trxId) {
    await prisma.bkashPayment.update({ where: { id: payment.id }, data: { status: 'VERIFICATION_FAILED', providerPayload: provider as Prisma.InputJsonObject } });
    return { redirect: frontendBillingUrl('failure') };
  }

  const now = new Date();
  const activeSubscription = await prisma.subscription.findFirst({
    where: { userId: payment.userId, status: 'ACTIVE', currentPeriodEnd: { gt: now } },
    orderBy: { currentPeriodEnd: 'desc' },
  });
  const extensionBase = activeSubscription?.planId === payment.planId ? activeSubscription.currentPeriodEnd : now;
  const periodEnd = new Date(extensionBase.getTime() + (payment.billingInterval === 'YEAR' ? 365 : 30) * 86400000);
  const subscriptionId = `bkash:${paymentID}`;
  const couponId = payment.providerPayload && typeof payment.providerPayload === 'object' &&
    'couponId' in payment.providerPayload ? String(payment.providerPayload.couponId) : null;

  const activated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.bkashPayment.updateMany({
      where: { id: payment.id, status: { not: 'COMPLETED' } },
      data: { trxId, status: 'COMPLETED', executedAt: now, providerPayload: provider as Prisma.InputJsonObject },
    });
    if (!claimed.count) return false;
    const alreadyUsed = await tx.bkashPayment.findFirst({ where: { trxId } });
    if (alreadyUsed && alreadyUsed.id !== payment.id) throw new AppError(409, 'Transaction has already been used.');
    await tx.subscription.updateMany({
      where: { userId: payment.userId, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] }, stripeSubscriptionId: { not: subscriptionId } },
      data: { status: 'CANCELED', canceledAt: now, cancelAtPeriodEnd: false },
    });
    await tx.subscription.upsert({
      where: { stripeSubscriptionId: subscriptionId },
      create: {
        userId: payment.userId,
        planId: payment.planId,
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: `bkash:${payment.userId}`,
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        couponId,
      },
      update: { status: 'ACTIVE', planId: payment.planId, currentPeriodStart: now, currentPeriodEnd: periodEnd, couponId },
    });
    await tx.invoice.upsert({
      where: { stripeInvoiceId: `bkash:${trxId}` },
      create: {
        userId: payment.userId,
        stripeInvoiceId: `bkash:${trxId}`,
        amountPaid: payment.amount,
        amountDue: payment.amount,
        currency: 'bdt',
        status: 'PAID',
        issuedAt: now,
        paidAt: now,
      },
      update: {},
    });
    await tx.userLimit.upsert({
      where: { userId: payment.userId },
      create: { userId: payment.userId, apiLimit: payment.plan.apiLimit, resumeLimit: payment.plan.resumeLimit, resetAt: periodEnd },
      update: { apiLimit: payment.plan.apiLimit, resumeLimit: payment.plan.resumeLimit, resetAt: periodEnd },
    });
    if (couponId) await tx.coupon.update({ where: { id: couponId }, data: { redeemed: { increment: 1 } } });
    return true;
  });

  if (!activated) return { redirect: frontendBillingUrl('success') };

  await bustDashboardCache(payment.userId);
  await createNotification({
    userId: payment.userId,
    type: 'BILLING',
    title: 'bKash payment successful',
    body: `Your ${payment.plan.name} access is active until ${periodEnd.toLocaleDateString('en-BD')}.`,
    link: '/dashboard/billing',
  });
  return { redirect: frontendBillingUrl('success') };
}
