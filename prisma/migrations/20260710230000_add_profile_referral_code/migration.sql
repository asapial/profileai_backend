-- Align UserProfile with prisma/schema/profile.prisma.
-- The field is optional, so this is safe for all existing profiles.
ALTER TABLE "user_profile"
  ADD COLUMN IF NOT EXISTS "referralCode" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "user_profile_referralCode_key"
  ON "user_profile"("referralCode");
