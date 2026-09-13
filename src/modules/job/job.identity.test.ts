import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duplicateReason, jobFreshness, normalizeJobUrl } from './job.identity';
import { createJobSchema, listJobsSchema, updateJobSchema } from './job.schema';

const job = { company: 'Example', title: 'Engineer', location: 'Dhaka', description: 'Build reliable software for customers.' };
test('URL identity ignores tracking but preserves job identifiers', () => {
  assert.equal(normalizeJobUrl('https://EXAMPLE.com/jobs/1/?utm_source=email#apply'), 'https://example.com/jobs/1');
  assert.notEqual(normalizeJobUrl('https://example.com/?gh_jid=1'), normalizeJobUrl('https://example.com/?gh_jid=2'));
  assert.throws(() => normalizeJobUrl('javascript:alert(1)'));
  assert.throws(() => normalizeJobUrl('https://user:pass@example.com'));
});
test('duplicate content tolerates whitespace and case without collapsing different locations', () => {
  assert.equal(duplicateReason(job, { ...job, title: ' ENGINEER ', description: 'Build  reliable software for customers.' }), 'content');
  assert.equal(duplicateReason(job, { ...job, location: 'London' }), null);
  assert.equal(duplicateReason({ ...job, canonicalUrl: 'https://example.com/1' }, { ...job, description: 'Changed', canonicalUrl: 'https://example.com/1?utm_source=test' }), 'url');
});
test('freshness never treats an import as verification and preserves closed records', () => {
  const now = new Date('2026-09-12T00:00:00Z');
  const base = { lifecycle: 'ACTIVE' as const, expiresAt: null, lastVerifiedAt: null };
  assert.deepEqual(jobFreshness(base, now), { lifecycle: 'UNKNOWN', freshness: 'unverified' });
  assert.equal(jobFreshness({ ...base, expiresAt: now }, now).lifecycle, 'EXPIRED');
  assert.equal(jobFreshness({ ...base, lastVerifiedAt: new Date('2026-08-29T00:00:00Z') }, now).lifecycle, 'POSSIBLY_EXPIRED');
  assert.equal(jobFreshness({ ...base, lastVerifiedAt: now }, now).freshness, 'recent');
  assert.equal(jobFreshness({ ...base, lifecycle: 'REMOVED', expiresAt: now }, now).lifecycle, 'REMOVED');
});
test('request validation rejects unsafe URLs and malformed list inputs', () => {
  assert.equal(createJobSchema.safeParse({ body: { ...job, canonicalUrl: 'javascript:alert(1)' } }).success, false);
  assert.equal(listJobsSchema.safeParse({ query: { limit: 'NaN' } }).success, false);
  assert.equal(listJobsSchema.safeParse({ query: { lifecycle: 'made-up' } }).success, false);
  assert.equal(updateJobSchema.safeParse({ params: { id: 'job' }, body: { title: 'Updated role' } }).success, true);
});
