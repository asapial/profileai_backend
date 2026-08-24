-- Earlier hand-written migrations created these indexes with DESC sort
-- modifiers while the Prisma schema declares the default ascending order.
-- Recreate them in the canonical form so migrate diff is clean.
DROP INDEX "application_event_applicationId_createdAt_idx";
CREATE INDEX "application_event_applicationId_createdAt_idx"
  ON "application_event"("applicationId", "createdAt");

DROP INDEX "cover_letter_userId_deletedAt_updatedAt_idx";
CREATE INDEX "cover_letter_userId_deletedAt_updatedAt_idx"
  ON "cover_letter"("userId", "deletedAt", "updatedAt");
