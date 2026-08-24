import { prisma } from "../lib/prisma";

type TableState = { relation: string | null };
type CountRow = { count: bigint };
type EnumRow = { value: string };

const run = async () => {
  const [
    tables,
    applicationEvents,
    orphanedApplicationEvents,
    exportKinds,
    referralCodeIndexes,
    advisoryLocks,
    managedIndexDefinitions,
    coverLetters,
  ] = await Promise.all([
    prisma.$queryRaw<TableState[]>`
      SELECT to_regclass(name)::text AS relation
      FROM unnest(ARRAY[
        'public.plan',
        'public.subscription',
        'public.invoice',
        'public.coupon',
        'public.payment_event',
        'public.referral',
        'public.reward_ledger',
        'public.referral_program'
      ]) AS name
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count FROM "application_event"
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "application_event" AS event
      LEFT JOIN "job_application" AS application
        ON application."id" = event."applicationId"
      WHERE application."id" IS NULL
    `,
    prisma.$queryRaw<EnumRow[]>`
      SELECT enumlabel AS value
      FROM pg_enum
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'ExportKind'
      ORDER BY enumsortorder
    `,
    prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'user_profile'
        AND indexname LIKE 'user_profile_referralCode%'
      ORDER BY indexname
    `,
    prisma.$queryRaw<
      Array<{
        pid: number;
        applicationName: string;
        state: string | null;
        queryStartedAt: Date | null;
      }>
    >`
      SELECT
        activity.pid,
        activity.application_name AS "applicationName",
        activity.state,
        activity.query_start AS "queryStartedAt"
      FROM pg_locks AS lock
      JOIN pg_stat_activity AS activity ON activity.pid = lock.pid
      WHERE lock.locktype = 'advisory'
        AND lock.granted = true
      ORDER BY activity.query_start
    `,
    prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'application_event_applicationId_createdAt_idx',
          'cover_letter_userId_deletedAt_updatedAt_idx'
        )
      ORDER BY indexname
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count FROM "cover_letter"
    `,
  ]);

  const output = {
    missingTables: tables
      .filter((row) => row.relation === null)
      .length,
    relations: tables.map((row) => row.relation),
    applicationEventRows: Number(applicationEvents[0]?.count ?? 0n),
    orphanedApplicationEventRows: Number(
      orphanedApplicationEvents[0]?.count ?? 0n,
    ),
    exportKinds: exportKinds.map((row) => row.value),
    referralCodeIndexes: referralCodeIndexes.map((row) => row.indexname),
    advisoryLocks,
    managedIndexDefinitions,
    coverLetterRows: Number(coverLetters[0]?.count ?? 0n),
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
};

run()
  .catch((error) => {
    process.stderr.write(
      `[schema-audit] ${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
