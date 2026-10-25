-- Explicit rollback. Run only after every deployed reader stops using disposition.
DROP INDEX IF EXISTS "job_userId_disposition_updatedAt_idx";
ALTER TABLE "job" DROP COLUMN IF EXISTS "disposition";
DROP TYPE IF EXISTS "JobDisposition";
