-- Browser-assisted desktop sign-in and consent-gated job search.
-- Additive: existing browser_task rows keep their jobId; search/capture tasks
-- are allowed to have no jobId because they produce captured listings instead.

ALTER TABLE "browser_task" ALTER COLUMN "jobId" DROP NOT NULL;

ALTER TABLE "site_policy" ADD COLUMN "search" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "site_policy" ADD COLUMN "scroll" BOOLEAN NOT NULL DEFAULT false;

UPDATE "site_policy"
SET "search" = true,
    "scroll" = true
WHERE "source" <> 'MANUAL';

CREATE TABLE "worker_auth_request" (
  "id" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "deviceName" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'windows',
  "appVersion" TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "publicKeyFingerprint" TEXT NOT NULL,
  "capabilities" JSONB NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "userId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "usedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "worker_auth_request_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "worker_auth_request_requestHash_key" ON "worker_auth_request"("requestHash");
CREATE INDEX "worker_auth_request_status_expiresAt_idx" ON "worker_auth_request"("status", "expiresAt");
CREATE INDEX "worker_auth_request_userId_createdAt_idx" ON "worker_auth_request"("userId", "createdAt");

CREATE TABLE "worker_site_consent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "search" BOOLEAN NOT NULL DEFAULT false,
  "scroll" BOOLEAN NOT NULL DEFAULT false,
  "capture" BOOLEAN NOT NULL DEFAULT false,
  "maxPages" INTEGER NOT NULL DEFAULT 1,
  "acknowledgedRisk" BOOLEAN NOT NULL DEFAULT false,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "worker_site_consent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "worker_site_consent_userId_source_key" ON "worker_site_consent"("userId", "source");
CREATE INDEX "worker_site_consent_userId_revokedAt_idx" ON "worker_site_consent"("userId", "revokedAt");
