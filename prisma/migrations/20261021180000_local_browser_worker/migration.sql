-- Local browser worker (additive).
-- Existing browser_task rows are preserved. New columns are nullable or have
-- defaults, so the table remains readable by the previous application build.
ALTER TABLE "browser_task" ADD COLUMN "deviceId" TEXT;
ALTER TABLE "browser_task" ADD COLUMN "source" TEXT;
ALTER TABLE "browser_task" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "browser_task" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "browser_task" ADD COLUMN "signature" TEXT;
ALTER TABLE "browser_task" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "browser_task" ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "browser_task" ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "browser_task" ADD COLUMN "policyVersion" TEXT;

CREATE TABLE "worker_device" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'windows',
  "appVersion" TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "publicKeyFingerprint" TEXT NOT NULL,
  "capabilities" JSONB NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "pairedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3),
  "lastIp" TEXT,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "worker_device_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "worker_pairing_code" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "nameHint" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "deviceId" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "worker_pairing_code_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "worker_session" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "accessTokenHash" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "accessExpiresAt" TIMESTAMP(3) NOT NULL,
  "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  "rotatedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "worker_session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "browser_task_event" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "seq" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL DEFAULT '',
  "data" JSONB NOT NULL DEFAULT '{}',
  "redacted" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "browser_task_event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "browser_task_checkpoint" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "state" TEXT NOT NULL,
  "url" TEXT NOT NULL DEFAULT '',
  "step" TEXT NOT NULL DEFAULT '',
  "observationHash" TEXT NOT NULL DEFAULT '',
  "completedActions" JSONB NOT NULL DEFAULT '[]',
  "submitted" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "browser_task_checkpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "worker_approval" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "summary" TEXT NOT NULL,
  "targetUrl" TEXT NOT NULL DEFAULT '',
  "risk" TEXT NOT NULL DEFAULT 'MEDIUM',
  "actionHash" TEXT NOT NULL,
  "evidence" JSONB NOT NULL DEFAULT '{}',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "decidedAt" TIMESTAMP(3),
  "decidedBy" TEXT,
  "decisionNote" TEXT,
  CONSTRAINT "worker_approval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "site_policy" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "domains" JSONB NOT NULL DEFAULT '[]',
  "discovery" BOOLEAN NOT NULL DEFAULT false,
  "extraction" BOOLEAN NOT NULL DEFAULT false,
  "formFill" BOOLEAN NOT NULL DEFAULT false,
  "submit" BOOLEAN NOT NULL DEFAULT false,
  "userPresenceRequired" BOOLEAN NOT NULL DEFAULT true,
  "maxPagesPerRun" INTEGER NOT NULL DEFAULT 12,
  "maxRequestsPerMinute" INTEGER NOT NULL DEFAULT 10,
  "reviewedAt" TIMESTAMP(3) NOT NULL,
  "reviewReference" TEXT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "reviewedBy" TEXT NOT NULL DEFAULT 'security',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "site_policy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "captured_listing" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "externalId" TEXT NOT NULL DEFAULT '',
  "fingerprint" TEXT NOT NULL,
  "canonicalUrl" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "captured_listing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "worker_device_publicKeyFingerprint_key" ON "worker_device"("publicKeyFingerprint");
CREATE INDEX "worker_device_userId_status_lastSeenAt_idx" ON "worker_device"("userId", "status", "lastSeenAt");
CREATE UNIQUE INDEX "worker_pairing_code_codeHash_key" ON "worker_pairing_code"("codeHash");
CREATE INDEX "worker_pairing_code_userId_expiresAt_idx" ON "worker_pairing_code"("userId", "expiresAt");
CREATE UNIQUE INDEX "worker_session_accessTokenHash_key" ON "worker_session"("accessTokenHash");
CREATE UNIQUE INDEX "worker_session_refreshTokenHash_key" ON "worker_session"("refreshTokenHash");
CREATE INDEX "worker_session_deviceId_revokedAt_idx" ON "worker_session"("deviceId", "revokedAt");
CREATE INDEX "worker_session_refreshExpiresAt_idx" ON "worker_session"("refreshExpiresAt");
CREATE UNIQUE INDEX "browser_task_event_taskId_seq_key" ON "browser_task_event"("taskId", "seq");
CREATE INDEX "browser_task_event_userId_createdAt_idx" ON "browser_task_event"("userId", "createdAt");
CREATE INDEX "browser_task_event_taskId_seq_idx" ON "browser_task_event"("taskId", "seq");
CREATE UNIQUE INDEX "browser_task_checkpoint_taskId_sequence_key" ON "browser_task_checkpoint"("taskId", "sequence");
CREATE INDEX "browser_task_checkpoint_userId_createdAt_idx" ON "browser_task_checkpoint"("userId", "createdAt");
CREATE INDEX "browser_task_checkpoint_taskId_sequence_idx" ON "browser_task_checkpoint"("taskId", "sequence");
CREATE INDEX "worker_approval_userId_state_requestedAt_idx" ON "worker_approval"("userId", "state", "requestedAt");
CREATE INDEX "worker_approval_taskId_state_idx" ON "worker_approval"("taskId", "state");
CREATE INDEX "worker_approval_expiresAt_idx" ON "worker_approval"("expiresAt");
CREATE UNIQUE INDEX "site_policy_source_version_key" ON "site_policy"("source", "version");
CREATE INDEX "site_policy_enabled_source_idx" ON "site_policy"("enabled", "source");
CREATE UNIQUE INDEX "captured_listing_userId_fingerprint_key" ON "captured_listing"("userId", "fingerprint");
CREATE INDEX "captured_listing_userId_capturedAt_idx" ON "captured_listing"("userId", "capturedAt");
CREATE INDEX "captured_listing_source_capturedAt_idx" ON "captured_listing"("source", "capturedAt");
CREATE INDEX "browser_task_userId_deviceId_state_idx" ON "browser_task"("userId", "deviceId", "state");
CREATE INDEX "browser_task_expiresAt_idx" ON "browser_task"("expiresAt");

ALTER TABLE "worker_session" ADD CONSTRAINT "worker_session_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "worker_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "worker_approval" ADD CONSTRAINT "worker_approval_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "worker_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rollback (manual, ordered; no pre-existing data is affected):
-- DROP TABLE "captured_listing";
-- DROP TABLE "site_policy";
-- DROP TABLE "worker_approval";
-- DROP TABLE "browser_task_checkpoint";
-- DROP TABLE "browser_task_event";
-- DROP TABLE "worker_session";
-- DROP TABLE "worker_pairing_code";
-- DROP TABLE "worker_device";
-- DROP INDEX "browser_task_expiresAt_idx";
-- DROP INDEX "browser_task_userId_deviceId_state_idx";
-- ALTER TABLE "browser_task"
--   DROP COLUMN "policyVersion", DROP COLUMN "attempt", DROP COLUMN "progress",
--   DROP COLUMN "revision", DROP COLUMN "signature", DROP COLUMN "expiresAt",
--   DROP COLUMN "priority", DROP COLUMN "source", DROP COLUMN "deviceId";
