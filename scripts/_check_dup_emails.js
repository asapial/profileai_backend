import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'node:fs';

const prisma = new PrismaClient();
const out = [];

try {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT email, COUNT(*)::int AS c
     FROM "user"
     GROUP BY email
     HAVING COUNT(*) > 1
     ORDER BY c DESC
     LIMIT 50`,
  );
  if (rows.length === 0) {
    out.push('NO_DUPLICATES');
  } else {
    out.push(`DUPLICATES_FOUND ${rows.length}`);
    for (const r of rows) out.push(`  ${r.email} -> ${r.c}`);
  }
} catch (e) {
  out.push('SCRIPT_ERROR ' + (e?.message || String(e)));
} finally {
  await prisma.$disconnect();
}

writeFileSync(process.env.OUT_FILE, out.join('\n'));
