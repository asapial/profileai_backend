// One-off: adds the `referralCode` column to user_profile so the seedDemoUser
// seeder (and any code path that reads it via Prisma) can run against the
// existing database. Safe to run multiple times — guards via IF NOT EXISTS.
import "dotenv/config";
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required.");

const sql = `
ALTER TABLE "user_profile"
  ADD COLUMN IF NOT EXISTS "referralCode" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profile_referralCode_key'
  ) THEN
    ALTER TABLE "user_profile"
      ADD CONSTRAINT "user_profile_referralCode_key" UNIQUE ("referralCode");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "user_profile_referralCode_idx"
  ON "user_profile" ("referralCode");
`;

const client = new Client({ connectionString: url });
await client.connect();
try {
  await client.query(sql);
  console.log("OK: user_profile.referralCode is present.");
} finally {
  await client.end();
}