import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncWorkerSheetBatch } from './harness.worker-sheet';

test('worker Sheet sync honors preferences and age, and retries after a partial failure', async () => {
  const now = Date.UTC(2026, 9, 28);
  const jobs = [
    { id: 'recent', publishedAt: new Date(now - 2 * 86_400_000) },
    { id: 'unknown-date', publishedAt: null },
    { id: 'old', publishedAt: new Date(now - 31 * 86_400_000) },
    { id: 'excluded', publishedAt: new Date(now) },
  ];
  const sheet = new Map<string, string>();
  let fail = true;
  const options = {
    jobs, now, maximumAgeDays: 30,
    evaluate: (job: typeof jobs[number]) => ({ score: 80, decision: job.id === 'excluded' ? 'NOT_ELIGIBLE' : 'ELIGIBLE' }),
    append: async (job: typeof jobs[number], _score: number, note: string) => {
      if (job.id === 'unknown-date' && fail) { fail = false; throw new Error('Google unavailable'); }
      sheet.set(job.id, note);
    },
  };
  await assert.rejects(syncWorkerSheetBatch(options), /Google unavailable/);
  const result = await syncWorkerSheetBatch(options);
  assert.deepEqual(result, { synced: 2, skipped: 2 });
  assert.deepEqual([...sheet.keys()], ['recent', 'unknown-date']);
  assert.match(sheet.get('unknown-date')!, /date unavailable/i);
});
