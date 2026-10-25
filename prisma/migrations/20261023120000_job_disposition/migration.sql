-- Additive user decision state for discovered jobs. Existing rows remain NEW.
CREATE TYPE "JobDisposition" AS ENUM ('NEW', 'SHORTLISTED', 'DISMISSED');

ALTER TABLE "job"
ADD COLUMN "disposition" "JobDisposition" NOT NULL DEFAULT 'NEW';

CREATE INDEX "job_userId_disposition_updatedAt_idx"
ON "job"("userId", "disposition", "updatedAt");
