CREATE TABLE "google_account_connection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "googleSubjectId" TEXT NOT NULL,
  "googleEmail" TEXT NOT NULL,
  "encryptedTokens" TEXT NOT NULL,
  "grantedScopes" TEXT[] NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CONNECTED',
  "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSuccessfulUseAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "google_account_connection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "google_capability" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "capability" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "google_capability_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "harness_oauth_state" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "verifier" TEXT NOT NULL,
  "capabilities" TEXT[] NOT NULL,
  "popupOrigin" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "harness_oauth_state_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "harness_preference_version" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "preferences" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "harness_preference_version_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "harness_run" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "preferenceVersionId" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'PREPARE',
  "state" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "pausedAt" TIMESTAMP(3),
  "stoppedAt" TIMESTAMP(3),
  "summary" JSONB NOT NULL DEFAULT '{}',
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "harness_run_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "harness_step" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "input" JSONB NOT NULL DEFAULT '{}',
  "output" JSONB NOT NULL DEFAULT '{}',
  "blocker" TEXT,
  "error" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "harness_step_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "consent_grant" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "scope" JSONB NOT NULL,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "sourceIp" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "consent_grant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "harness_candidate_decision" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "reasons" JSONB NOT NULL,
  "missing" JSONB NOT NULL,
  "preferenceVersion" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "harness_candidate_decision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "harness_artifact" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "runId" TEXT,
  "jobId" TEXT,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'GENERATED',
  "localRef" TEXT,
  "providerId" TEXT,
  "providerUrl" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "harness_artifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "harness_external_sync" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "jobId" TEXT,
  "kind" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "externalUrl" TEXT,
  "state" TEXT NOT NULL DEFAULT 'SYNCED',
  "syncKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "harness_external_sync_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "browser_companion" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "lastSeenAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "browser_companion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "browser_task" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "runId" TEXT,
  "jobId" TEXT NOT NULL,
  "applicationId" TEXT,
  "adapter" TEXT NOT NULL,
  "targetUrl" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'PREPARE',
  "state" TEXT NOT NULL DEFAULT 'QUEUED',
  "payload" JSONB NOT NULL,
  "result" JSONB NOT NULL DEFAULT '{}',
  "approvedAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "browser_task_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "harness_audit_event" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "runId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "outcome" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "harness_audit_event_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "google_account_connection_userId_key" ON "google_account_connection"("userId");
CREATE INDEX "google_account_connection_userId_status_idx" ON "google_account_connection"("userId", "status");
CREATE UNIQUE INDEX "google_capability_connectionId_capability_key" ON "google_capability"("connectionId", "capability");
CREATE INDEX "google_capability_connectionId_enabled_idx" ON "google_capability"("connectionId", "enabled");
CREATE INDEX "harness_oauth_state_userId_expiresAt_idx" ON "harness_oauth_state"("userId", "expiresAt");
CREATE UNIQUE INDEX "harness_preference_version_userId_version_key" ON "harness_preference_version"("userId", "version");
CREATE INDEX "harness_preference_version_userId_createdAt_idx" ON "harness_preference_version"("userId", "createdAt");
CREATE INDEX "harness_run_userId_createdAt_idx" ON "harness_run"("userId", "createdAt");
CREATE INDEX "harness_run_state_requestedAt_idx" ON "harness_run"("state", "requestedAt");
CREATE UNIQUE INDEX "harness_step_runId_key_key" ON "harness_step"("runId", "key");
CREATE INDEX "harness_step_state_nextAttemptAt_idx" ON "harness_step"("state", "nextAttemptAt");
CREATE INDEX "harness_step_userId_createdAt_idx" ON "harness_step"("userId", "createdAt");
CREATE INDEX "consent_grant_userId_kind_revokedAt_idx" ON "consent_grant"("userId", "kind", "revokedAt");
CREATE UNIQUE INDEX "harness_candidate_decision_runId_jobId_key" ON "harness_candidate_decision"("runId", "jobId");
CREATE INDEX "harness_candidate_decision_userId_decision_score_idx" ON "harness_candidate_decision"("userId", "decision", "score");
CREATE INDEX "harness_artifact_userId_jobId_kind_idx" ON "harness_artifact"("userId", "jobId", "kind");
CREATE UNIQUE INDEX "harness_external_sync_userId_kind_syncKey_key" ON "harness_external_sync"("userId", "kind", "syncKey");
CREATE INDEX "harness_external_sync_userId_kind_lastSyncedAt_idx" ON "harness_external_sync"("userId", "kind", "lastSyncedAt");
CREATE UNIQUE INDEX "browser_companion_tokenHash_key" ON "browser_companion"("tokenHash");
CREATE INDEX "browser_companion_userId_status_idx" ON "browser_companion"("userId", "status");
CREATE INDEX "browser_task_userId_state_createdAt_idx" ON "browser_task"("userId", "state", "createdAt");
CREATE INDEX "browser_task_state_createdAt_idx" ON "browser_task"("state", "createdAt");
CREATE INDEX "harness_audit_event_userId_createdAt_idx" ON "harness_audit_event"("userId", "createdAt");
CREATE INDEX "harness_audit_event_runId_createdAt_idx" ON "harness_audit_event"("runId", "createdAt");

ALTER TABLE "google_account_connection" ADD CONSTRAINT "google_account_connection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "google_capability" ADD CONSTRAINT "google_capability_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "google_account_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "harness_oauth_state" ADD CONSTRAINT "harness_oauth_state_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "harness_preference_version" ADD CONSTRAINT "harness_preference_version_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "harness_run" ADD CONSTRAINT "harness_run_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "harness_run" ADD CONSTRAINT "harness_run_preferenceVersionId_fkey" FOREIGN KEY ("preferenceVersionId") REFERENCES "harness_preference_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "harness_step" ADD CONSTRAINT "harness_step_runId_fkey" FOREIGN KEY ("runId") REFERENCES "harness_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consent_grant" ADD CONSTRAINT "consent_grant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "harness_candidate_decision" ADD CONSTRAINT "harness_candidate_decision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "harness_candidate_decision" ADD CONSTRAINT "harness_candidate_decision_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "browser_companion" ADD CONSTRAINT "browser_companion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "browser_task" ADD CONSTRAINT "browser_task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "browser_task" ADD CONSTRAINT "browser_task_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "harness_audit_event" ADD CONSTRAINT "harness_audit_event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
