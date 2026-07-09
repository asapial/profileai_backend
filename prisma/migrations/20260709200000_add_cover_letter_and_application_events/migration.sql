-- CreateEnum
CREATE TYPE "CoverLetterStatus" AS ENUM ('DRAFT', 'GENERATED', 'EXPORTED');

-- CreateEnum
CREATE TYPE "ApplicationEventType" AS ENUM (
  'CREATED',
  'STATUS_CHANGE',
  'NOTE_EDIT',
  'REMINDER_SET',
  'REMINDER_FIRED',
  'DOCUMENT_ATTACHED'
);

-- CreateTable
CREATE TABLE "cover_letter" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "resumeId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "targetJobTitle" TEXT,
  "targetCompany" TEXT,
  "status" "CoverLetterStatus" NOT NULL DEFAULT 'DRAFT',
  "contentJson" JSONB NOT NULL,
  "contentText" TEXT,
  "previousVersions" JSONB,
  "pdfUrl" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "cover_letter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_event" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "type" "ApplicationEventType" NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "application_event_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "job_application"
  ADD COLUMN "reminderAt" TIMESTAMP(3),
  ADD COLUMN "coverLetterId" TEXT;

-- CreateIndex
CREATE INDEX "cover_letter_userId_deletedAt_updatedAt_idx"
  ON "cover_letter"("userId", "deletedAt", "updatedAt" DESC);

CREATE INDEX "cover_letter_userId_deletedAt_idx"
  ON "cover_letter"("userId", "deletedAt");

CREATE INDEX "cover_letter_resumeId_idx"
  ON "cover_letter"("resumeId");

CREATE INDEX "job_application_userId_reminderAt_idx"
  ON "job_application"("userId", "reminderAt");

CREATE INDEX "application_event_applicationId_createdAt_idx"
  ON "application_event"("applicationId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "cover_letter"
  ADD CONSTRAINT "cover_letter_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cover_letter"
  ADD CONSTRAINT "cover_letter_resumeId_fkey"
  FOREIGN KEY ("resumeId") REFERENCES "resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "job_application"
  ADD CONSTRAINT "job_application_coverLetterId_fkey"
  FOREIGN KEY ("coverLetterId") REFERENCES "cover_letter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "application_event"
  ADD CONSTRAINT "application_event_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "job_application"("id") ON DELETE CASCADE ON UPDATE CASCADE;