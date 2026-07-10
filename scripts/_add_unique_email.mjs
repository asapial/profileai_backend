// One-shot script: add a unique constraint on "user".email safely.
// Exits non-zero on duplicate emails (operator must deduplicate first).
import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'node:fs';

const LOG_FILE = 'D:/Project/ProfileAI/profileai_backend/_add_unique.log';
const lines = [];
function log(...args) {
  const line = args.map(String).join(' ');
  lines.push(line);
  // eslint-disable-next-line no-console
  console.log(line);
  try { writeFileSync(LOG_FILE, lines.join('\n') + '\n'); } catch {}
}

const prisma = new PrismaClient();

try {
  log('Step 1: checking for duplicate emails in "user" ...');
  const dupes = await prisma.$queryRawUnsafe(
    `SELECT email, COUNT(*)::int AS c
       FROM "user"
       GROUP BY email
       HAVING COUNT(*) > 1
       ORDER BY c DESC
       LIMIT 50`,
  );

  if (dupes.length === 0) {
    log('  OK: no duplicate emails.');
  } else {
    log(`  FAIL: ${dupes.length} email(s) have duplicates:`);
    for (const r of dupes) log(`    ${r.email} (${r.c}x)`);
    log('  Resolve duplicates in the DB before re-running.');
    process.exitCode = 2;
    return;
  }

  log('Step 2: checking whether unique index already exists ...');
  const idx = await prisma.$queryRawUnsafe(
    `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename  = 'user'
         AND indexname  = 'user_email_key'`,
  );
  if (idx.length > 0) {
    log('  OK: unique index user_email_key already present. Nothing to do.');
    return;
  }

  log('Step 3: creating unique index on user(email) ...');
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX "user_email_key" ON "user"("email")`,
  );
  log('  OK: unique index created.');
} catch (e) {
  log('ERROR:', e?.message ?? String(e));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
