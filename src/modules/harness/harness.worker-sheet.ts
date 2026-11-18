export async function syncWorkerSheetBatch<T extends { id: string; publishedAt: Date | null }>(options: {
  jobs: T[];
  maximumAgeDays: number;
  now: number;
  evaluate: (job: T) => { score: number; decision: string } | null;
  append: (job: T, score: number, note: string) => Promise<unknown>;
}): Promise<{ synced: number; skipped: number }> {
  let synced = 0;
  let skipped = 0;
  for (const job of options.jobs) {
    const decision = options.evaluate(job);
    const tooOld = job.publishedAt !== null && options.now - job.publishedAt.getTime() > options.maximumAgeDays * 86_400_000;
    if (tooOld || decision?.decision === 'NOT_ELIGIBLE') { skipped += 1; continue; }
    await options.append(job, decision?.score ?? 0, job.publishedAt ? '' : 'Posting date unavailable; check recency.');
    synced += 1;
  }
  return { synced, skipped };
}
