ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'SAVED';
ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'PREPARING';
ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'FOLLOW_UP_DUE';
ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'RECRUITER_SCREEN';
ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'ASSESSMENT';

CREATE TYPE "JobLifecycle" AS ENUM ('ACTIVE', 'POSSIBLY_EXPIRED', 'EXPIRED', 'REMOVED', 'UNKNOWN');
CREATE TYPE "JobSourceType" AS ENUM ('MANUAL', 'USER_URL', 'LEVER', 'GREENHOUSE', 'COMPANY_CAREER', 'PARTNER_API');
CREATE TYPE "WorkplaceType" AS ENUM ('REMOTE', 'HYBRID', 'ON_SITE', 'UNSPECIFIED');

CREATE TABLE "job" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "workplaceType" "WorkplaceType" NOT NULL DEFAULT 'UNSPECIFIED',
    "employmentType" TEXT,
    "salaryMin" DECIMAL(12,2),
    "salaryMax" DECIMAL(12,2),
    "salaryCurrency" TEXT,
    "salaryPeriod" TEXT,
    "salaryIsEstimated" BOOLEAN NOT NULL DEFAULT false,
    "canonicalUrl" TEXT,
    "sourceName" TEXT NOT NULL DEFAULT 'Manual import',
    "sourceType" "JobSourceType" NOT NULL DEFAULT 'MANUAL',
    "lifecycle" "JobLifecycle" NOT NULL DEFAULT 'ACTIVE',
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "contentHash" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "job_source_listing" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceType" "JobSourceType" NOT NULL,
    "externalId" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "canonicalUrl" TEXT,
    "attribution" TEXT,
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3),
    "rawHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "job_source_listing_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "job_application"
  ADD COLUMN "jobId" TEXT,
  ADD COLUMN "nextAction" TEXT,
  ADD COLUMN "contactName" TEXT,
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "deadlineAt" TIMESTAMP(3);

CREATE INDEX "job_userId_lifecycle_updatedAt_idx" ON "job"("userId", "lifecycle", "updatedAt");
CREATE INDEX "job_userId_company_title_idx" ON "job"("userId", "company", "title");
CREATE INDEX "job_contentHash_idx" ON "job"("contentHash");
CREATE UNIQUE INDEX "job_source_listing_sourceName_externalId_key" ON "job_source_listing"("sourceName", "externalId");
CREATE INDEX "job_source_listing_jobId_idx" ON "job_source_listing"("jobId");
CREATE INDEX "job_source_listing_sourceUrl_idx" ON "job_source_listing"("sourceUrl");
CREATE INDEX "job_application_userId_status_updatedAt_idx" ON "job_application"("userId", "status", "updatedAt");
CREATE INDEX "job_application_jobId_idx" ON "job_application"("jobId");

ALTER TABLE "job" ADD CONSTRAINT "job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_source_listing" ADD CONSTRAINT "job_source_listing_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_application" ADD CONSTRAINT "job_application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
