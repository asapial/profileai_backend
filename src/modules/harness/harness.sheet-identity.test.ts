import test from 'node:test';
import assert from 'node:assert/strict';
import { findTrackerUrl, trackerUrlKey } from './harness.sheet-identity';

test('recognizes an existing tracker URL without tracking parameters', () => {
  assert.equal(findTrackerUrl([['Job URL'], ['https://www.example.com/jobs/123?utm_source=mail']], 'https://example.com/jobs/123'), 2);
  assert.equal(findTrackerUrl([['https://example.com/jobs/124']], 'https://example.com/jobs/123'), null);
  assert.equal(trackerUrlKey('not a URL'), null);
});

test('keeps identity-bearing query parameters distinct', () => {
  assert.notEqual(trackerUrlKey('https://example.com/jobs?gh_jid=1'), trackerUrlKey('https://example.com/jobs?gh_jid=2'));
});
