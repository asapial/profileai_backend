import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRawUnsafe<{ email: string; c: bigint }[]>(
    `SELECT email, COUNT(*)::bigint AS c
     FROM "user"
     GROUP BY email
     HAVING COUNT(*) > 1
     ORDER BY c DESC
     LIMIT 50`,
  );
  if (rows.length === 0) {
    console.log('NO_DUPLICATES');
  } else {
    console.log(`DUPLICATES_FOUND ${rows.length}`);
    for (const r of rows) {
      console.log(`  ${r.email} -> ${r.c}`);
    }
  }
}

main()
  .catch((e) => {
    console.error('SCRIPT_ERROR', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
