-- Add public-resume share fields to resume and a new resume_view analytics table.
-- Slugs are nullable so existing rows don't need a backfill. Backfill can run
-- separately via a script that generates unique slugs from resume.id.

-- AlterTable
ALTER TABLE "public"."resume"
  ADD COLUMN "slug"            TEXT,
  ADD COLUMN "disabledByAdmin" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "noindex"         BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex (slug must be unique when present)
CREATE UNIQUE INDEX "resume_slug_key" ON "public"."resume"("slug");

-- Lookup index used by /public/resumes/:slug
CREATE INDEX "resume_isPublic_disabledByAdmin_idx"
  ON "public"."resume"("isPublic", "disabledByAdmin");

-- CreateTable
CREATE TABLE "public"."resume_view" (
    "id"         TEXT NOT NULL,
    "resumeId"   TEXT NOT NULL,
    "eventType"  TEXT NOT NULL,
    "viewerHash" TEXT,
    "referrer"   TEXT,
    "userAgent"  TEXT,
    "ipAddress"  TEXT,
    "country"    TEXT,
    "isBot"      BOOLEAN NOT NULL DEFAULT false,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_view_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resume_view_resumeId_eventType_createdAt_idx"
  ON "public"."resume_view"("resumeId", "eventType", "createdAt");

CREATE INDEX "resume_view_resumeId_viewerHash_createdAt_idx"
  ON "public"."resume_view"("resumeId", "viewerHash", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."resume_view"
  ADD CONSTRAINT "resume_view_resumeId_fkey"
  FOREIGN KEY ("resumeId") REFERENCES "public"."resume"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
