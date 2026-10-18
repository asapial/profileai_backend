CREATE TABLE "bkash_payment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "billingInterval" "billing_interval" NOT NULL DEFAULT 'MONTH',
  "merchantInvoiceNumber" TEXT NOT NULL,
  "paymentId" TEXT,
  "trxId" TEXT,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BDT',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "providerPayload" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "executedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bkash_payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bkash_payment_merchantInvoiceNumber_key" ON "bkash_payment"("merchantInvoiceNumber");
CREATE UNIQUE INDEX "bkash_payment_paymentId_key" ON "bkash_payment"("paymentId");
CREATE UNIQUE INDEX "bkash_payment_trxId_key" ON "bkash_payment"("trxId");
CREATE INDEX "bkash_payment_userId_createdAt_idx" ON "bkash_payment"("userId", "createdAt");
CREATE INDEX "bkash_payment_status_expiresAt_idx" ON "bkash_payment"("status", "expiresAt");

ALTER TABLE "bkash_payment" ADD CONSTRAINT "bkash_payment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bkash_payment" ADD CONSTRAINT "bkash_payment_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
