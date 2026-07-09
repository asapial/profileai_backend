// ─── Billing (U-P14) ───────────────────────────────────────────────────────
// Wraps Stripe behind a feature flag so the rest of the app can stay
// ship-ready when keys aren't configured. Sources of truth:
//
//   • Stripe  — current plan, invoices, customer portal, webhooks
//   • Our DB  — snapshot of plan / subscription / invoice for fast UI
//                reads, idempotent webhook log (PaymentEvent)
//
// Every state-changing operation goes through one of two gates:
//   1. Local DB snapshots are written *before* we call Stripe
//      (subscriptions we created), so the page renders even if Stripe
//      is degraded.
//   2. Stripe events are deduped via PaymentEvent.stripeEventId so a
//      webhook replay can never double-apply a quota change.
// ─────────────────────────────────────────────────────────────────────────
import status from 'http-status';
import Stripe from 'stripe';
import { envVars } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import AppError from '../../errorHelpers/AppError';
import { bustDashboardCache } from '../dashboard/dashboard.service';
import { createNotification } from '../notification/notification.service';

const stripeEnabled = (): boolean => Boolean(envVars.STRIPE.STRIPE_SECRET_KEY);

// Singletons — Stripe SDK throws if you init without a key.
let stripeClient: Stripe | null = null;
const getStripe = (): Stripe => {
  if (!stripeClient) {
    const key = envVars.STRIPE.STRIPE_SECRET_KEY;
    if (!key) throw new AppError(503, 'Billing is not configured.');
    stripeClient = new Stripe(key);
  }
  return stripeClient;
};

const FRONTEND_BASE = (): string =>
  (envVars.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

const planKey = (slug: string): string => `billing:plan:${slug}`;
const customerKey = (userId: string): string => `billing:stripe_customer:${userId}`;
const CACHE_TTL = 5 * 60;

const requireEnabled = (): void => {
  if (!stripeEnabled()) {
    throw new AppError(
      status.SERVICE_UNAVAILABLE,
      'Billing is not configured. Please contact your administrator.'
    );
  }
};

// ─── Plans (read-through) ──────────────────────────────────────────────────

export const listPlans = async () => {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { amount: 'asc' },
  });
  // Backstop — if the admin hasn't seeded plans yet, return the canonical
  // defaults so the pricing page never renders empty.
  if (plans.length === 0) return defaultPlans();
  return plans.map(serializePlan);
};

export const getPlanBySlug = async (slug: string) => {
  const cached = await redis.get(planKey(slug)).catch(() => null);
  if (cached) {
    try { return JSON.parse(cached) as ReturnType<typeof serializePlan>; } catch { /* fall through */ }
  }
  const plan = await prisma.plan.findUnique({ where: { slug } });
  if (!plan) return null;
  const data = serializePlan(plan);
  await redis.set(planKey(slug), JSON.stringify(data), 'EX', CACHE_TTL).catch(() => {});
  return data;
};

export const seedPlansFromEnv = async (): Promise<void> => {
  // Idempotent upsert of plan rows from STRIPE_PRICE_* env vars so the
  // service can boot on a fresh DB without a manual SQL step.
  const map: Array<[string, string, number, string, number, number]> = [
    ['free', 'Free', envVars.STRIPE.STRIPE_ENABLED ? 0 : 0, 'MONTH', 50, 5],
    // Real Stripe mappings come from STRIPE_PRICE_PRO / BUSINESS env.
  ];
  const pro = process.env.STRIPE_PRICE_PRO;
  const biz = process.env.STRIPE_PRICE_BUSINESS;
  if (pro) map.push(['pro', 'Pro', 1499, 'MONTH', 500, 25]);
  if (biz) map.push(['business', 'Business', 4999, 'MONTH', 5000, 100]);
  await Promise.all(
    map.map(([slug, name, amount, interval, apiLimit, resumeLimit]) =>
      prisma.plan.upsert({
        where: { slug },
        create: {
          slug,
          name,
          stripePriceId: pro && slug === 'pro' ? pro : biz && slug === 'business' ? biz : `${slug}_local`,
          stripeProductId: `${slug}_product`,
          amount,
          interval: interval as 'MONTH' | 'YEAR',
          apiLimit,
          resumeLimit,
          features: defaultFeatures(slug),
        },
        update: { isActive: true },
      })
    )
  );
};

const defaultFeatures = (slug: string): string[] => {
  switch (slug) {
    case 'free':
      return ['Up to 5 resumes', '50 AI credits', 'Basic templates'];
    case 'pro':
      return ['25 resumes', '500 AI credits', 'All templates', 'AI interview prep'];
    case 'business':
      return ['100 resumes', '5,000 AI credits', 'Priority support', 'Team seat add-on'];
    default:
      return [];
  }
};

const defaultPlans = (): Array<ReturnType<typeof serializePlan>> =>
  (['free', 'pro', 'business'] as const).map((slug) => ({
    id: slug,
    slug,
    name: slug === 'free' ? 'Free' : slug === 'pro' ? 'Pro' : 'Business',
    description: null,
    stripePriceId: null,
    stripeProductId: null,
    amount: slug === 'free' ? 0 : slug === 'pro' ? 1499 : 4999,
    currency: 'usd',
    interval: 'MONTH',
    features: defaultFeatures(slug),
    apiLimit: slug === 'free' ? 50 : slug === 'pro' ? 500 : 5000,
    resumeLimit: slug === 'free' ? 5 : slug === 'pro' ? 25 : 100,
  }));

const serializePlan = (p: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  stripePriceId: string | null;
  stripeProductId: string | null;
  amount: number;
  currency: string;
  interval: string;
  features: unknown;
  apiLimit: number;
  resumeLimit: number;
}) => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  description: p.description,
  stripePriceId: p.stripePriceId,
  stripeProductId: p.stripeProductId,
  amount: p.amount,
  currency: p.currency,
  interval: p.interval,
  features: Array.isArray(p.features) ? (p.features as string[]) : [],
  apiLimit: p.apiLimit,
  resumeLimit: p.resumeLimit,
});

// ─── Subscription (local read + checkout/portal) ───────────────────────────

export const getCurrentSubscription = async (userId: string) => {
  const sub = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] },
    },
    include: { plan: true, coupon: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!sub) {
    return { plan: await getPlanBySlug('free'), subscription: null };
  }
  return {
    plan: serializePlan(sub.plan),
    subscription: {
      id: sub.id,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      couponCode: sub.coupon?.code ?? null,
    },
  };
};

// Cached mapping: our userId → Stripe customer id. We re-check on
// every checkout because a user may have created the customer on a
// different code path (e.g. portal).
const rememberedCustomer = async (userId: string): Promise<string | null> => {
  const cached = await redis.get(customerKey(userId)).catch(() => null);
  if (cached) return cached;
  const sub = await prisma.subscription.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { stripeCustomerId: true },
  });
  if (sub?.stripeCustomerId) {
    await redis.set(customerKey(userId), sub.stripeCustomerId, 'EX', CACHE_TTL).catch(() => {});
    return sub.stripeCustomerId;
  }
  return null;
};

const rememberCustomer = async (userId: string, customerId: string) => {
  await redis.set(customerKey(userId), customerId, 'EX', CACHE_TTL).catch(() => {});
};

const findOrCreateCustomer = async (userId: string, email: string, name: string) => {
  requireEnabled();
  const remembered = await rememberedCustomer(userId);
  if (remembered) return remembered;
  const stripe = getStripe();
  const existing = await stripe.customers.list({ email, limit: 1 });
  let customer = existing.data[0];
  if (!customer) {
    customer = await stripe.customers.create({ email, name, metadata: { userId } });
  }
  await rememberCustomer(userId, customer.id);
  return customer.id;
};

export const createCheckoutSession = async (input: {
  userId: string;
  email: string;
  name: string;
  planSlug: string;
  couponCode?: string;
}): Promise<{ url: string }> => {
  requireEnabled();
  const plan = await prisma.plan.findUnique({ where: { slug: input.planSlug } });
  if (!plan) throw new AppError(404, `Unknown plan: ${input.planSlug}`);
  const customerId = await findOrCreateCustomer(input.userId, input.email, input.name);

  // Resolve coupon — we accept any active local row. Stripe still does
  // its own validation when it's applied to the session.
  let couponId: string | undefined;
  if (input.couponCode) {
    const coupon = await prisma.coupon.findUnique({
      where: { code: input.couponCode.toUpperCase() },
    });
    if (coupon?.isActive) couponId = coupon.id;
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create(
    {
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      // Coupon, if any, is attached to the customer for the session duration.
      ...(couponId
        ? { discounts: [{ coupon: (await prisma.coupon.findUnique({ where: { id: couponId } }))?.stripeCouponId ?? 'placeholder' }] }
        : {}),
      success_url: `${FRONTEND_BASE()}/dashboard/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_BASE()}/dashboard/billing/cancel`,
      allow_promotion_codes: true,
      client_reference_id: input.userId,
      metadata: {
        userId: input.userId,
        planSlug: plan.slug,
        planId: plan.id,
        couponId: couponId ?? '',
      },
    },
    { idempotencyKey: `co:${input.userId}:${plan.slug}` } // cancels double-clicks
  );
  if (!session.url) throw new AppError(502, 'Stripe did not return a checkout URL.');
  return { url: session.url };
};

export const openBillingPortal = async (userId: string, email: string, name: string) => {
  requireEnabled();
  const customerId = await findOrCreateCustomer(userId, email, name);
  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${FRONTEND_BASE()}${envVars.STRIPE.STRIPE_PORTAL_RETURN_URL}`,
  });
  return { url: session.url };
};

export const cancelAtPeriodEnd = async (userId: string) => {
  requireEnabled();
  const sub = await prisma.subscription.findFirst({
    where: { userId, status: { in: ['ACTIVE', 'TRIALING'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (!sub) throw new AppError(404, 'No active subscription to cancel.');
  const updated = await getStripe().subscriptions.update(sub.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
  await prisma.subscription.update({
    where: { id: sub.id },
    data: { cancelAtPeriodEnd: true, status: deriveStatus(updated.status) },
  });
  return { id: sub.id, cancelAtPeriodEnd: true };
};

const deriveStatus = (s: Stripe.Subscription.Status): 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE' | 'UNPAID' => {
  switch (s) {
    case 'trialing':
      return 'TRIALING';
    case 'active':
      return 'ACTIVE';
    case 'past_due':
      return 'PAST_DUE';
    case 'canceled':
      return 'CANCELED';
    case 'incomplete':
    case 'incomplete_expired':
      return 'INCOMPLETE';
    case 'unpaid':
      return 'UNPAID';
    default:
      return 'INCOMPLETE';
  }
};

// ─── Coupons & Invoices (read-only) ────────────────────────────────────────

export const previewCoupon = async (codeRaw: string, planSlug: string) => {
  const code = codeRaw.trim().toUpperCase();
  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (!coupon || !coupon.isActive) {
    throw new AppError(404, 'Coupon not found or expired.');
  }
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
    throw new AppError(400, 'Coupon has expired.');
  }
  if (coupon.maxRedemptions && coupon.redeemed >= coupon.maxRedemptions) {
    throw new AppError(400, 'Coupon redemption limit reached.');
  }
  const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
  if (!plan) throw new AppError(404, `Unknown plan: ${planSlug}`);
  let discountedAmount = plan.amount;
  if (coupon.percentOff) discountedAmount = Math.round(plan.amount * (100 - coupon.percentOff) / 100);
  else if (coupon.amountOff) discountedAmount = Math.max(plan.amount - coupon.amountOff, 0);
  return {
    code: coupon.code,
    percentOff: coupon.percentOff,
    amountOff: coupon.amountOff,
    currency: coupon.currency,
    duration: coupon.duration,
    baseAmount: plan.amount,
    finalAmount: discountedAmount,
    currencyCode: plan.currency,
  };
};

export const listInvoices = async (userId: string) => {
  const rows = await prisma.invoice.findMany({
    where: { userId },
    orderBy: { issuedAt: 'desc' },
    take: 24,
  });
  return rows.map((r) => ({
    id: r.id,
    stripeInvoiceId: r.stripeInvoiceId,
    amountPaid: r.amountPaid,
    amountDue: r.amountDue,
    currency: r.currency,
    status: r.status,
    hostedInvoiceUrl: r.hostedInvoiceUrl,
    invoicePdfUrl: r.invoicePdfUrl,
    issuedAt: r.issuedAt.toISOString(),
    paidAt: r.paidAt?.toISOString() ?? null,
  }));
};

// ─── Webhook ingress ───────────────────────────────────────────────────────

export const handleStripeWebhook = async (
  rawBody: Buffer | string,
  signature: string | undefined
): Promise<{ received: true; processed: boolean }> => {
  if (!envVars.STRIPE.STRIPE_WEBHOOK_SECRET) {
    throw new AppError(503, 'Stripe webhook is not configured.');
  }
  if (!signature) throw new AppError(400, 'Missing stripe-signature header.');
  const stripe = new Stripe(envVars.STRIPE.STRIPE_SECRET_KEY!);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      envVars.STRIPE.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    throw new AppError(400, `Invalid Stripe signature: ${(err as Error).message}`);
  }

  // Idempotency: every event is deduped on stripeEventId BEFORE we touch
  // anything else. Replays are no-ops.
  const existing = await prisma.paymentEvent.findUnique({
    where: { stripeEventId: event.id },
  });
  if (existing && existing.processed) {
    return { received: true, processed: false };
  }
  await prisma.paymentEvent.upsert({
    where: { stripeEventId: event.id },
    create: {
      stripeEventId: event.id,
      type: event.type,
      payload: event as unknown as object,
    },
    update: {},
  });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = (session.metadata?.userId ?? session.client_reference_id) as string | undefined;
        const planId = session.metadata?.planId as string | undefined;
        const couponId = session.metadata?.couponId ?? '';
        if (!userId || !planId || !session.subscription || !session.customer) {
          throw new Error('checkout.session.completed missing metadata');
        }
        const sub = await stripe.subscriptions.retrieve(session.subscription as string, {
          expand: ['items.data.price'],
        });
        await applySubscriptionUpsert(userId, sub, planId, couponId || null);
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = (sub.metadata?.userId as string | undefined) ?? null;
        if (!userId) break;
        const planSlug = (sub.items.data[0]?.price?.metadata?.slug as string | undefined) ?? null;
        if (!planSlug) break;
        const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
        if (!plan) break;
        await applySubscriptionUpsert(userId, sub, plan.id, null);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await markSubscriptionCanceled(sub.id);
        break;
      }
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (!customerId) break;
        await upsertInvoiceFromStripe(invoice, customerId);
        break;
      }
      default:
        // Unknown event types are still recorded as processed so we
        // don't reprocess on retry.
        break;
    }
    await prisma.paymentEvent.update({
      where: { stripeEventId: event.id },
      data: { processed: true, processedAt: new Date(), errorMessage: null },
    });
    return { received: true, processed: true };
  } catch (err) {
    const message = (err as Error).message ?? 'unknown';
    await prisma.paymentEvent.update({
      where: { stripeEventId: event.id },
      data: { errorMessage: message },
    });
    throw err;
  }
};

// Inside the webhook handler we need fresh data from Stripe, so this
// uses a dedicated ad-hoc client (still uses the same secret).
async function applySubscriptionUpsert(
  userId: string,
  sub: Stripe.Subscription,
  planId: string,
  couponId: string | null
) {
  const priceId = sub.items.data[0]?.price?.id ?? null;
  const plan = await prisma.plan.findFirst({
    where: priceId ? { stripePriceId: priceId } : { id: planId },
  });
  const resolvedPlanId = plan?.id ?? planId;
  // Stripe removed top-level period_start/end on Subscription in API
  // 2024-06-20+ — they live on the SubscriptionItem instead.
  const item = sub.items.data[0];
  const periodStart = item?.current_period_start ?? Math.floor(Date.now() / 1000);
  const periodEnd = item?.current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 86400;

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: sub.id },
    create: {
      userId,
      planId: resolvedPlanId,
      stripeSubscriptionId: sub.id,
      stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      status: deriveStatus(sub.status),
      currentPeriodStart: new Date(periodStart * 1000),
      currentPeriodEnd: new Date(periodEnd * 1000),
      couponId,
    },
    update: {
      planId: resolvedPlanId,
      status: deriveStatus(sub.status),
      currentPeriodStart: new Date(periodStart * 1000),
      currentPeriodEnd: new Date(periodEnd * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
      ...(couponId ? { couponId } : {}),
    },
  });

  // Apply feature limits — *only* increase (never decrease) so a
  // user doesn't lose lifetime data when they downgrade.
  const planLimits = await prisma.plan.findUnique({ where: { id: resolvedPlanId } });
  if (planLimits) {
    const existing = await prisma.userLimit.findUnique({ where: { userId } });
    await prisma.userLimit.upsert({
      where: { userId },
      create: {
        userId,
        apiLimit: planLimits.apiLimit,
        resumeLimit: planLimits.resumeLimit,
        apiUsed: 0,
        resumeUsed: existing?.resumeUsed ?? 0,
        resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      update: {
        apiLimit: { set: Math.max(planLimits.apiLimit, existing?.apiLimit ?? 0) },
        resumeLimit: { set: Math.max(planLimits.resumeLimit, existing?.resumeLimit ?? 0) },
      },
    });
  }

  await bustDashboardCache(userId);
  await createNotification({
    userId,
    type: 'BILLING',
    title: 'Subscription updated',
    body: `Your ${planLimits?.name ?? 'subscription'} is now ${deriveStatus(sub.status).toLowerCase().replace('_', ' ')}.`,
    link: '/dashboard/billing',
  });
}

async function markSubscriptionCanceled(stripeSubscriptionId: string) {
  const sub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId },
  });
  if (!sub) return;
  await prisma.subscription.update({
    where: { stripeSubscriptionId },
    data: { status: 'CANCELED', canceledAt: new Date(), cancelAtPeriodEnd: true },
  });
  await bustDashboardCache(sub.userId);
  await createNotification({
    userId: sub.userId,
    type: 'BILLING',
    title: 'Subscription canceled',
    body: 'Your subscription has been canceled and will end at the current period close.',
    link: '/dashboard/billing',
  });
}

async function upsertInvoiceFromStripe(invoice: Stripe.Invoice, customerId: string) {
  const sub = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
    orderBy: { createdAt: 'desc' },
  });
  if (!sub) return;
  await prisma.invoice.upsert({
    where: { stripeInvoiceId: invoice.id ?? `${sub.id}-${invoice.created}` },
    create: {
      userId: sub.userId,
      stripeInvoiceId: invoice.id ?? `${sub.id}-${invoice.created}`,
      amountPaid: invoice.amount_paid ?? 0,
      amountDue: invoice.amount_due ?? 0,
      currency: invoice.currency ?? 'usd',
      status: invoice.status === 'paid' ? 'PAID' : invoice.status === 'open' ? 'OPEN' : 'DRAFT',
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      invoicePdfUrl: invoice.invoice_pdf ?? null,
      issuedAt: new Date((invoice.created ?? Date.now() / 1000) * 1000),
      paidAt: invoice.status === 'paid' ? new Date() : null,
    },
    update: {},
  });
}

export const getPaymentEvents = async (userId: string) => {
  // Used by admin diagnostics only; surfaced to the user as "billing
  // history is in the invoices view".
  void userId;
  return prisma.paymentEvent.findMany({ orderBy: { receivedAt: 'desc' }, take: 5 });
};
