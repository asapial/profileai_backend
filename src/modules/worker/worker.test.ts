import assert from 'node:assert/strict';
import { sign as cryptoSign } from 'node:crypto';
import test from 'node:test';
import {
  NonceCache,
  generateSigningKeyPair,
  pairingCodeHash,
  publicKeyFingerprint,
  requestSignaturePayload,
  signTaskEnvelope,
  tokenHash,
  verifyRequestSignature,
  verifyTaskEnvelope,
  type TaskEnvelopeInput,
} from './worker.crypto';
import { classifyTaskSource, mapAdapterToSource, mapTaskMode, policyForSource } from './worker.policy.data';
import { accessSessionStatus, newSessionMaterial, pairingCodeStatus, refreshSessionStatus } from './worker.trust';
import { hybridJobSearchSchema, workerResultSchema } from './worker.schema';

const keys = generateSigningKeyPair();

function validEnvelope(now = Date.now()): TaskEnvelopeInput {
  return {
    protocolVersion: 1,
    taskId: 'task_1',
    deviceId: 'dev_1',
    runId: 'run_1',
    type: 'PREPARE',
    mode: 'DRAFT',
    source: 'GREENHOUSE',
    targetUrl: 'https://boards.greenhouse.io/acme/jobs/123',
    allowedDomains: ['boards.greenhouse.io'],
    limits: { maxPages: 12, maxActions: 80, maxDurationMs: 600_000, maxConcurrentPages: 1 },
    policyVersion: 'greenhouse-2026.10',
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 15 * 60_000).toISOString(),
    nonce: 'envelope-nonce-0123456789',
    payload: { taskType: 'PREPARE' },
    documents: [],
  };
}

test('pairing codes normalize and enforce one-use plus expiry', () => {
  assert.equal(pairingCodeHash('7K4M-92QF'), pairingCodeHash('7k4m92qf'));
  assert.notEqual(pairingCodeHash('7K4M-92QF'), pairingCodeHash('7K4M-92QG'));
  const now = new Date('2026-10-22T12:00:00.000Z');
  assert.equal(pairingCodeStatus({ usedAt: null, expiresAt: new Date('2026-10-22T12:10:00.000Z') }, now), 'VALID');
  assert.equal(pairingCodeStatus({ usedAt: now, expiresAt: new Date('2026-10-22T12:10:00.000Z') }, now), 'USED');
  assert.equal(pairingCodeStatus({ usedAt: null, expiresAt: now }, now), 'EXPIRED');
});

test('device key fingerprints are stable and public keys are Ed25519', () => {
  assert.equal(publicKeyFingerprint(keys.publicKey), publicKeyFingerprint(keys.publicKey.replace(/\n/g, '\r\n')));
  assert.equal(publicKeyFingerprint(keys.publicKey).length, 64);
  assert.notEqual(keys.publicKey, keys.privateKey);
});

test('signed worker requests accept only the exact method, path, body, timestamp and nonce', () => {
  const timestamp = new Date().toISOString();
  const nonce = 'abcdef0123456789abcdef0123456789';
  const body = { deviceId: 'dev_1' };
  const path = '/api/v1/worker/tasks/claim';
  const payload = requestSignaturePayload({ method: 'POST', path, body, timestamp, nonce, deviceId: 'dev_1' });
  const signature = cryptoSign(null, Buffer.from(payload), keys.privateKey).toString('base64');

  assert.deepEqual(verifyRequestSignature(keys.publicKey, { method: 'POST', path, body, timestamp, nonce, deviceId: 'dev_1', signature }), { valid: true });
  assert.equal(verifyRequestSignature(keys.publicKey, { method: 'POST', path, body: { deviceId: 'dev_2' }, timestamp, nonce, deviceId: 'dev_1', signature }).valid, false);
  assert.equal(verifyRequestSignature(keys.publicKey, { method: 'POST', path: '/api/v1/worker/tasks/other', body, timestamp, nonce, deviceId: 'dev_1', signature }).valid, false);
  assert.equal(verifyRequestSignature(keys.publicKey, { method: 'POST', path, body, timestamp, nonce, deviceId: 'dev_1', signature }, { maxSkewMs: 1, now: new Date(Date.now() + 10_000) }).valid, false);
});

test('nonce replay cache rejects the second use and clears expired entries', () => {
  const cache = new NonceCache(1_000);
  assert.equal(cache.remember('dev_1', 'nonce-1', 10_000), true);
  assert.equal(cache.remember('dev_1', 'nonce-1', 10_001), false);
  assert.equal(cache.remember('dev_2', 'nonce-1', 10_002), true);
  assert.equal(cache.remember('dev_1', 'nonce-1', 12_000), true);
});

test('session material rotates both tokens and hashes never reveal raw values', () => {
  const first = newSessionMaterial(Date.parse('2026-10-22T12:00:00.000Z'));
  const second = newSessionMaterial(Date.parse('2026-10-22T12:00:00.000Z'));
  assert.match(first.accessToken, /^paiw_at_/);
  assert.match(first.refreshToken, /^paiw_rt_/);
  assert.notEqual(first.accessToken, second.accessToken);
  assert.notEqual(first.accessTokenHash, second.accessTokenHash);
  assert.notEqual(first.accessTokenHash, tokenHash(first.refreshToken));
  assert.ok(first.accessExpiresAt.getTime() < first.refreshExpiresAt.getTime());
});

test('access and refresh states fail closed for revoked, expired and revoked-device sessions', () => {
  const now = new Date('2026-10-22T12:00:00.000Z');
  const device = { status: 'ACTIVE', revokedAt: null };
  assert.equal(accessSessionStatus({ revokedAt: null, accessExpiresAt: new Date('2026-10-23T12:00:00.000Z'), device }, now), 'ACTIVE');
  assert.equal(accessSessionStatus({ revokedAt: now, accessExpiresAt: new Date('2026-10-23T12:00:00.000Z'), device }, now), 'REVOKED');
  assert.equal(accessSessionStatus({ revokedAt: null, accessExpiresAt: now, device }, now), 'EXPIRED');
  assert.equal(accessSessionStatus({ revokedAt: null, accessExpiresAt: new Date('2026-10-23T12:00:00.000Z'), device: { status: 'REVOKED', revokedAt: now } }, now), 'DEVICE_REVOKED');
  assert.equal(refreshSessionStatus({ revokedAt: null, refreshExpiresAt: new Date('2026-11-21T12:00:00.000Z'), device }, now), 'ACTIVE');
  assert.equal(refreshSessionStatus({ revokedAt: now, refreshExpiresAt: new Date('2026-11-21T12:00:00.000Z'), device }, now), 'REVOKED');
});

test('task envelopes verify only while intact, unexpired and addressed to the device', () => {
  const now = Date.now();
  const signed = signTaskEnvelope(validEnvelope(now), keys.privateKey);
  assert.deepEqual(verifyTaskEnvelope(signed, keys.publicKey, { deviceId: 'dev_1', now: new Date(now) }), { valid: true });
  assert.equal(verifyTaskEnvelope({ ...signed, targetUrl: 'https://evil.example/jobs/123' }, keys.publicKey, { now: new Date(now) }).valid, false);
  assert.equal(verifyTaskEnvelope(signed, keys.publicKey, { deviceId: 'dev_2', now: new Date(now) }).valid, false);
  assert.equal(verifyTaskEnvelope(signed, keys.publicKey, { deviceId: 'dev_1', now: new Date(now + 16 * 60_000) }).valid, false);
});

test('source policy preserves A/B/C capabilities and blocks restricted-source submit', () => {
  const greenhouse = policyForSource('GREENHOUSE');
  assert.equal(greenhouse.level, 'A');
  assert.equal(greenhouse.submit, true);
  assert.equal(greenhouse.discovery, true);

  const facebook = policyForSource('FACEBOOK');
  assert.equal(facebook.level, 'B');
  assert.equal(facebook.discovery, false);
  assert.equal(facebook.formFill, false);
  assert.equal(facebook.submit, false);
  assert.equal(facebook.userPresenceRequired, true);

  const linkedin = policyForSource('LINKEDIN');
  assert.equal(linkedin.level, 'C');
  assert.equal(linkedin.discovery, false);
  assert.equal(linkedin.extraction, false);
  assert.equal(linkedin.formFill, false);
  assert.equal(linkedin.submit, false);

  const bdjobs = policyForSource('BDJOBS');
  assert.equal(bdjobs.level, 'B');
  assert.equal(bdjobs.search, true);
  assert.equal(bdjobs.formFill, false);
  assert.equal(bdjobs.submit, false);

  assert.equal(mapAdapterToSource('GREENHOUSE', null), 'GREENHOUSE');
  assert.equal(mapAdapterToSource('CUSTOM', null), 'COMPANY_CAREER');
  assert.equal(mapTaskMode('REVIEW_SUBMIT'), 'ASSISTED');
  assert.equal(mapTaskMode('PREPARE'), 'DRAFT');
  assert.equal(mapTaskMode('RESEARCH'), 'RESEARCH');
});

test('task source is classified from the target URL before adapter or hints', () => {
  assert.equal(classifyTaskSource('GENERIC', 'https://www.linkedin.com/jobs/view/123'), 'LINKEDIN');
  assert.equal(classifyTaskSource('GREENHOUSE', 'https://m.facebook.com/groups/jobs/1'), 'FACEBOOK');
  assert.equal(classifyTaskSource('GENERIC', 'https://jobs.eu.lever.co/acme/123'), 'LEVER');
  assert.equal(classifyTaskSource('GENERIC', 'https://jobs.bdjobs.com/jobdetails.asp?id=1'), 'BDJOBS');
  assert.equal(classifyTaskSource('GENERIC', 'https://boards.greenhouse.io/acme/jobs/123'), 'GREENHOUSE');
  assert.equal(classifyTaskSource('GREENHOUSE', 'https://evil.example/apply'), 'COMPANY_CAREER');
  assert.equal(classifyTaskSource('GREENHOUSE', 'https://careers.example.com/apply', 'GREENHOUSE'), 'COMPANY_CAREER');
  assert.equal(classifyTaskSource('GENERIC', 'https://careers.example.com/apply', 'COMPANY_CAREER'), 'COMPANY_CAREER');
});

test('hybrid job search validates open and private source plans', () => {
  const open = hybridJobSearchSchema.parse({ query: 'Frontend engineer' });
  assert.deepEqual(open.sources, ['REMOTIVE', 'JOBICY', 'ARBEITNOW']);
  assert.equal(open.privateSourceConsent, false);
  const privatePlan = hybridJobSearchSchema.parse({ query: 'React', sources: ['BDJOBS', 'LINKEDIN'], privateSourceConsent: true });
  assert.equal(privatePlan.sources.length, 2);
  assert.equal(privatePlan.privateSourceConsent, true);
});

test('worker result schema requires confirmation evidence for a submitted result', () => {
  assert.equal(workerResultSchema.parse({ state: 'SUBMITTED', confirmation: { url: 'https://boards.greenhouse.io/acme/confirmation' } }).state, 'SUBMITTED');
  assert.equal(workerResultSchema.safeParse({ state: 'SUBMITTED' }).success, false);
  assert.equal(workerResultSchema.safeParse({ state: 'AUTO_SUBMITTING' }).success, false);
  assert.equal(workerResultSchema.safeParse({ state: 'SUBMITTED', unknownFields: ['salary'] }).success, false);
  assert.equal(workerResultSchema.safeParse({ state: 'COMPLETED', confirmation: { url: 42 } }).success, false);
});
