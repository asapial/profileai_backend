-- Persist admin security alerts and audit activity, record AI usage by time,
-- and mark sessions that completed two-factor authentication.
CREATE TYPE "SecurityAlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE "SecurityAlertStatus" AS ENUM ('OPEN', 'RESOLVED');

ALTER TABLE "session" ADD COLUMN "twoFactorVerifiedAt" TIMESTAMP(3);

CREATE TABLE "ai_usage_event" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_usage_event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "security_alert" (
    "id" TEXT NOT NULL,
    "severity" "SecurityAlertSeverity" NOT NULL DEFAULT 'WARNING',
    "status" "SecurityAlertStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "source" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "security_alert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_usage_event_createdAt_idx" ON "ai_usage_event"("createdAt");
CREATE INDEX "ai_usage_event_userId_createdAt_idx" ON "ai_usage_event"("userId", "createdAt");
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");
CREATE INDEX "audit_log_actorId_createdAt_idx" ON "audit_log"("actorId", "createdAt");
CREATE INDEX "audit_log_action_createdAt_idx" ON "audit_log"("action", "createdAt");
CREATE INDEX "security_alert_status_severity_createdAt_idx" ON "security_alert"("status", "severity", "createdAt");
