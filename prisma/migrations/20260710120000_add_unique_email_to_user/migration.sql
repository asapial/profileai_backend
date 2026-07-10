-- Add a unique constraint on User.email so prisma.user.findUnique({ where: { email } })
-- compiles. The auth.service relies on email being a unique lookup key (loginUser,
-- registerUser, forgotPassword, verifyEmail, changePassword, etc.).

-- Safety: if duplicates already exist, this CREATE UNIQUE INDEX will fail.
-- Deduplicate first via:
--   SELECT email, array_agg(id) FROM "user" GROUP BY email HAVING count(*) > 1;
-- then resolve the duplicates manually before re-running the migration.

CREATE UNIQUE INDEX "user_email_key" ON "user"("email");
