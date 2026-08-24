-- The billing and referral models existed in the Prisma schema without a
-- corresponding migration. This migration closes that drift and safely
-- backfills application-event ownership before enforcing NOT NULL.

CREATE TYPE "billing_interval" AS ENUM ('MONTH', 'YEAR');
CREATE TYPE "subscription_status" AS ENUM (
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
  'INCOMPLETE',
  'UNPAID'
);
CREATE TYPE "invoice_status" AS ENUM (
  'DRAFT',
  'OPEN',
  'PAID',
  'UNCOLLECTIBLE',
  'VOID'
);
CREATE TYPE "coupon_duration" AS ENUM ('ONCE', 'REPEATING', 'FOREVER');
CREATE TYPE "ReferralTrigger" AS ENUM ('EMAIL_VERIFIED', 'SUBSCRIBED');
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'REWARDED', 'VOIDED');
CREATE TYPE "RewardType" AS ENUM ('API_CREDIT', 'RESUME_CREDIT', 'CASH');
CREATE TYPE "RewardStatus" AS ENUM ('PENDING', 'GRANTED', 'VOIDED');

ALTER TYPE "ExportKind" ADD VALUE 'COVER_LETTER_PDF';

ALTER TABLE "application_event" ADD COLUMN "userId" TEXT;
UPDATE "application_event" AS event
SET "userId" = application."userId"
FROM "job_application" AS application
WHERE event."applicationId" = application."id";
ALTER TABLE "application_event" ALTER COLUMN "userId" SET NOT NULL;

DROP INDEX IF EXISTS "user_profile_referralCode_idx";

CREATE TABLE "plan" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "stripePriceId" TEXT NOT NULL,
  "stripeProductId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "interval" "billing_interval" NOT NULL DEFAULT 'MONTH',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "features" JSONB NOT NULL,
  "apiLimit" INTEGER NOT NULL DEFAULT 0,
  "resumeLimit" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "stripeSubscriptionId" TEXT NOT NULL,
  "stripeCustomerId" TEXT NOT NULL,
  "status" "subscription_status" NOT NULL DEFAULT 'ACTIVE',
  "currentPeriodStart" TIMESTAMP(3) NOT NULL,
  "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "canceledAt" TIMESTAMP(3),
  "couponId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "stripeInvoiceId" TEXT NOT NULL,
  "amountPaid" INTEGER NOT NULL,
  "amountDue" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "status" "invoice_status" NOT NULL DEFAULT 'PAID',
  "hostedInvoiceUrl" TEXT,
  "invoicePdfUrl" TEXT,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coupon" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "stripeCouponId" TEXT,
  "percentOff" INTEGER,
  "amountOff" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "duration" "coupon_duration" NOT NULL DEFAULT 'ONCE',
  "durationMonths" INTEGER,
  "maxRedemptions" INTEGER,
  "redeemed" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coupon_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_event" (
  "id" TEXT NOT NULL,
  "stripeEventId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "processed" BOOLEAN NOT NULL DEFAULT false,
  "processedAt" TIMESTAMP(3),
  "payload" JSONB NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "errorMessage" TEXT,
  CONSTRAINT "payment_event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "referral" (
  "id" TEXT NOT NULL,
  "referrerId" TEXT NOT NULL,
  "refereeId" TEXT NOT NULL,
  "referralCode" TEXT NOT NULL,
  "trigger" "ReferralTrigger" NOT NULL DEFAULT 'EMAIL_VERIFIED',
  "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "rewardId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rewardedAt" TIMESTAMP(3),
  CONSTRAINT "referral_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reward_ledger" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "RewardType" NOT NULL,
  "amount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "RewardStatus" NOT NULL DEFAULT 'GRANTED',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reward_ledger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "referral_program" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "referrerReward" INTEGER NOT NULL DEFAULT 50,
  "refereeReward" INTEGER NOT NULL DEFAULT 25,
  "paidConversionBonus" INTEGER NOT NULL DEFAULT 0,
  "blockSelfReferral" BOOLEAN NOT NULL DEFAULT true,
  "dailyIpCap" INTEGER NOT NULL DEFAULT 3,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "referral_program_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plan_slug_key" ON "plan"("slug");
CREATE UNIQUE INDEX "plan_stripePriceId_key" ON "plan"("stripePriceId");
CREATE INDEX "plan_slug_idx" ON "plan"("slug");
CREATE UNIQUE INDEX "subscription_stripeSubscriptionId_key"
  ON "subscription"("stripeSubscriptionId");
CREATE INDEX "subscription_userId_idx" ON "subscription"("userId");
CREATE INDEX "subscription_stripeCustomerId_idx"
  ON "subscription"("stripeCustomerId");
CREATE UNIQUE INDEX "invoice_stripeInvoiceId_key"
  ON "invoice"("stripeInvoiceId");
CREATE INDEX "invoice_userId_idx" ON "invoice"("userId");
CREATE UNIQUE INDEX "coupon_code_key" ON "coupon"("code");
CREATE UNIQUE INDEX "coupon_stripeCouponId_key" ON "coupon"("stripeCouponId");
CREATE UNIQUE INDEX "payment_event_stripeEventId_key"
  ON "payment_event"("stripeEventId");
CREATE INDEX "payment_event_type_idx" ON "payment_event"("type");
CREATE UNIQUE INDEX "referral_refereeId_key" ON "referral"("refereeId");
CREATE UNIQUE INDEX "referral_rewardId_key" ON "referral"("rewardId");
CREATE INDEX "referral_referrerId_status_idx"
  ON "referral"("referrerId", "status");
CREATE INDEX "referral_referralCode_idx" ON "referral"("referralCode");
CREATE INDEX "reward_ledger_userId_type_createdAt_idx"
  ON "reward_ledger"("userId", "type", "createdAt");
CREATE INDEX "application_event_userId_applicationId_createdAt_idx"
  ON "application_event"("userId", "applicationId", "createdAt");

ALTER TABLE "application_event"
  ADD CONSTRAINT "application_event_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription"
  ADD CONSTRAINT "subscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription"
  ADD CONSTRAINT "subscription_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "plan"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription"
  ADD CONSTRAINT "subscription_couponId_fkey"
  FOREIGN KEY ("couponId") REFERENCES "coupon"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice"
  ADD CONSTRAINT "invoice_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referral"
  ADD CONSTRAINT "referral_referrerId_fkey"
  FOREIGN KEY ("referrerId") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referral"
  ADD CONSTRAINT "referral_refereeId_fkey"
  FOREIGN KEY ("refereeId") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referral"
  ADD CONSTRAINT "referral_rewardId_fkey"
  FOREIGN KEY ("rewardId") REFERENCES "reward_ledger"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reward_ledger"
  ADD CONSTRAINT "reward_ledger_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
