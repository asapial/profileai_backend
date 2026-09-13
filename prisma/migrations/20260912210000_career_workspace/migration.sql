-- DropIndex
DROP INDEX "job_source_listing_sourceName_externalId_key";

-- CreateTable
CREATE TABLE "career_evidence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "technologies" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'USER_CONFIRMED',
    "source" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "career_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_document" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT,
    "resumeId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recipient" TEXT,
    "evidence" JSONB NOT NULL,
    "versions" JSONB NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "career_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_analysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "career_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_preference" (
    "userId" TEXT NOT NULL,
    "preferences" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "career_preference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "career_usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "career_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_source" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "policy" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "career_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_connection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "tokens" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "career_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_oauth_state" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "verifier" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "career_oauth_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_delivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "career_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "career_evidence_userId_updatedAt_idx" ON "career_evidence"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "career_document_userId_updatedAt_idx" ON "career_document"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "career_analysis_userId_cacheKey_key" ON "career_analysis"("userId", "cacheKey");

-- CreateIndex
CREATE UNIQUE INDEX "career_usage_userId_feature_period_key" ON "career_usage"("userId", "feature", "period");

-- CreateIndex
CREATE UNIQUE INDEX "career_source_provider_board_key" ON "career_source"("provider", "board");

-- CreateIndex
CREATE UNIQUE INDEX "career_connection_userId_provider_key" ON "career_connection"("userId", "provider");

-- CreateIndex
CREATE INDEX "career_delivery_state_nextAttemptAt_idx" ON "career_delivery"("state", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "career_delivery_userId_key_key" ON "career_delivery"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "job_source_listing_jobId_sourceName_externalId_key" ON "job_source_listing"("jobId", "sourceName", "externalId");

-- AddForeignKey
ALTER TABLE "career_evidence" ADD CONSTRAINT "career_evidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_document" ADD CONSTRAINT "career_document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_analysis" ADD CONSTRAINT "career_analysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_preference" ADD CONSTRAINT "career_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_usage" ADD CONSTRAINT "career_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_connection" ADD CONSTRAINT "career_connection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_oauth_state" ADD CONSTRAINT "career_oauth_state_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_delivery" ADD CONSTRAINT "career_delivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
