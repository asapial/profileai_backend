CREATE TYPE "TemplateReviewStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "resume_template"
ADD COLUMN "documentType" "ResumeType" NOT NULL DEFAULT 'RESUME',
ADD COLUMN "reviewStatus" "TemplateReviewStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "ownerId" TEXT,
ADD COLUMN "sourceTemplateId" TEXT,
ADD COLUMN "customization" JSONB,
ADD COLUMN "rejectionReason" TEXT,
ADD COLUMN "submittedAt" TIMESTAMP(3),
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedBy" TEXT,
ADD COLUMN "isCommunity" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "resume_template"
ADD CONSTRAINT "resume_template_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "resume_template_documentType_reviewStatus_isActive_idx"
ON "resume_template"("documentType", "reviewStatus", "isActive");

CREATE INDEX "resume_template_ownerId_updatedAt_idx"
ON "resume_template"("ownerId", "updatedAt");

CREATE INDEX "resume_template_sourceTemplateId_idx"
ON "resume_template"("sourceTemplateId");
