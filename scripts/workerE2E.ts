import assert from 'node:assert/strict';
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, randomUUID, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { prisma } from '../src/lib/prisma';
import { globalErrorHandler } from '../src/middleware/globalErrorHandler';
import { workerRouter } from '../src/modules/worker/worker.router';
import { createPairingCode } from '../src/modules/worker/worker.service';

if (process.env.RUN_WORKER_E2E !== '1') {
  console.error('Refusing to touch the database. Set RUN_WORKER_E2E=1 to run the disposable worker end-to-end test.');
  process.exit(1);
}
process.env.WORKER_ENABLED = 'true';

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item === undefined ? null : item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
  return `{${entries.join(',')}}`;
};

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const id = `e2e_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
const email = `${id}@example.invalid`;

const app = express();
app.use(express.json());
app.use('/api/v1/worker', workerRouter);
app.use(globalErrorHandler);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', () => resolve()));
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;

type Api<T> = { success: boolean; message: string; data: T };
const request = async <T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: Api<T> | { success: false; message: string } }> => {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  return { status: response.status, body: await response.json() as Api<T> };
};

const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

let deviceId = '';
let accessToken = '';

const signed = async <T>(method: string, path: string, body?: unknown): Promise<{ status: number; body: Api<T> | { success: false; message: string } }> => {
  const timestamp = new Date().toISOString();
  const nonce = randomBytes(18).toString('hex');
  const payload = [method.toUpperCase(), path, sha256(canonicalJson(body ?? {})), timestamp, nonce].join('\n');
  const signature = cryptoSign(null, Buffer.from(payload), createPrivateKey(privateKey)).toString('base64');
  return request<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Worker-Device': deviceId,
      'X-Worker-Timestamp': timestamp,
      'X-Worker-Nonce': nonce,
      'X-Worker-Signature': signature,
    },
  });
};

try {
  const user = await prisma.user.create({ data: { id: `usr_${id}`, name: 'Worker E2E', email } });
  const job = await prisma.job.create({
    data: {
      userId: user.id,
      title: 'Platform Engineer',
      company: 'Northstar Labs',
      description: 'Synthetic job created by the worker end-to-end test.',
      canonicalUrl: 'https://boards.greenhouse.io/acme/jobs/123',
      sourceName: 'Greenhouse',
      isPrivate: true,
    },
  });
  const task = await prisma.browserTask.create({
    data: {
      userId: user.id,
      jobId: job.id,
      adapter: 'GENERIC',
      source: null,
      targetUrl: 'https://boards.greenhouse.io/acme/jobs/123',
      mode: 'REVIEW_SUBMIT',
      state: 'QUEUED',
      priority: 100,
      payload: { taskType: 'PREPARE', documents: [] },
    },
  });

  const pairing = await createPairingCode(user.id, 'E2E device');
  const pairResponse = await request<{ deviceId: string; accessToken: string; refreshToken: string; serverPublicKey: string }>('/api/v1/worker/pair', {
    method: 'POST',
    body: JSON.stringify({
      code: pairing.code,
      name: 'E2E Desktop',
      platform: 'windows',
      appVersion: '0.1.0',
      publicKey,
      capabilities: ['prepare', 'assist', 'checkpoint'],
    }),
  });
  assert.equal(pairResponse.status, 200, JSON.stringify(pairResponse.body));
  assert.ok('data' in pairResponse.body);
  deviceId = pairResponse.body.data.deviceId;
  accessToken = pairResponse.body.data.accessToken;

  const userBefore = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const claim = await signed<{ task: { taskId: string; signature: string; source: string; mode: string; allowedDomains: string[]; [key: string]: unknown } }>(
    'POST', '/api/v1/worker/tasks/claim', { deviceId },
  );
  assert.equal(claim.status, 200, JSON.stringify(claim.body));
  assert.ok('data' in claim.body && claim.body.data.task);
  const envelope = claim.body.data.task;
  assert.equal(envelope.taskId, task.id);
  assert.equal(envelope.source, 'GREENHOUSE');
  assert.equal(envelope.mode, 'ASSISTED');
  assert.deepEqual(envelope.allowedDomains, ['boards.greenhouse.io', 'job-boards.greenhouse.io', 'greenhouse.io']);

  const { signature, ...unsigned } = envelope;
  const validEnvelope = (() => {
    try {
      return cryptoVerify(
        null,
        Buffer.from(canonicalJson(unsigned)),
        createPublicKey(pairResponse.body.data.serverPublicKey),
        Buffer.from(signature, 'base64'),
      );
    } catch {
      return false;
    }
  })();
  assert.equal(validEnvelope, true, 'server task signature must verify with the paired public key');

  const eventResponse = await signed('POST', `/api/v1/worker/tasks/${task.id}/events`, {
    events: [{
      seq: 1,
      taskId: task.id,
      at: new Date().toISOString(),
      type: 'RUN_STARTED',
      message: 'E2E run started',
      data: { mode: 'ASSISTED' },
      redacted: true,
    }],
  });
  assert.equal(eventResponse.status, 200, JSON.stringify(eventResponse.body));

  const checkpointResponse = await signed('POST', `/api/v1/worker/tasks/${task.id}/checkpoints`, {
    taskId: task.id,
    deviceId,
    sequence: 2,
    state: 'FORM_FILLED',
    url: task.targetUrl,
    step: 'PREPARE',
    observationHash: 'e2e-hash',
    completedActions: ['fill:email'],
    submitted: false,
    metadata: { e2e: true },
    createdAt: new Date().toISOString(),
  });
  assert.equal(checkpointResponse.status, 200, JSON.stringify(checkpointResponse.body));

  const prematureSubmit = await signed('POST', `/api/v1/worker/tasks/${task.id}/result`, {
    state: 'SUBMITTED',
    adapter: 'GREENHOUSE',
    unknownFields: [],
    confirmation: { url: 'https://boards.greenhouse.io/acme/thanks' },
  });
  assert.equal(prematureSubmit.status, 409, JSON.stringify(prematureSubmit.body));

  const approvalId = `apr_${randomUUID()}`;
  const approvalResponse = await signed<{ id: string }>('POST', `/api/v1/worker/tasks/${task.id}/approvals`, {
    taskId: task.id,
    deviceId,
    kind: 'SUBMIT',
    summary: 'Submit the synthetic E2E application.',
    targetUrl: task.targetUrl,
    risk: 'HIGH',
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    evidence: { approvalId },
  });
  assert.equal(approvalResponse.status, 200, JSON.stringify(approvalResponse.body));
  assert.ok('data' in approvalResponse.body);
  assert.equal(approvalResponse.body.data.id, approvalId);

  const pending = await signed<Array<{ id: string; taskId: string; state: string }>>('GET', '/api/v1/worker/approvals/pending');
  assert.equal(pending.status, 200, JSON.stringify(pending.body));
  assert.ok('data' in pending.body);
  assert.ok(pending.body.data.some(item => item.id === approvalId && item.taskId === task.id && item.state === 'PENDING'));

  const decision = await signed('POST', `/api/v1/worker/device/approvals/${approvalId}/decision`, { decision: 'APPROVED', note: 'E2E approval' });
  assert.equal(decision.status, 200, JSON.stringify(decision.body));

  const submitted = await signed<{ state: string; applicationId?: string }>('POST', `/api/v1/worker/tasks/${task.id}/result`, {
    state: 'SUBMITTED',
    adapter: 'GREENHOUSE',
    unknownFields: [],
    confirmation: { url: 'https://boards.greenhouse.io/acme/thanks', text: 'Application received' },
  });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  assert.ok('data' in submitted.body);
  assert.equal(submitted.body.data.state, 'SUBMITTED');

  const duplicateTerminal = await signed('POST', `/api/v1/worker/tasks/${task.id}/result`, {
    state: 'COMPLETED',
    adapter: 'GREENHOUSE',
    unknownFields: [],
  });
  assert.equal(duplicateTerminal.status, 409, JSON.stringify(duplicateTerminal.body));

  const [storedTask, storedApproval, application, audits, events, checkpoints] = await Promise.all([
    prisma.browserTask.findUniqueOrThrow({ where: { id: task.id } }),
    prisma.workerApproval.findUniqueOrThrow({ where: { id: approvalId } }),
    prisma.jobApplication.findFirst({ where: { userId: user.id, jobId: job.id } }),
    prisma.harnessAuditEvent.count({ where: { userId: user.id } }),
    prisma.browserTaskEvent.count({ where: { taskId: task.id } }),
    prisma.browserTaskCheckpoint.count({ where: { taskId: task.id } }),
  ]);
  assert.equal(storedTask.state, 'SUBMITTED');
  assert.equal(storedApproval.state, 'APPROVED');
  assert.ok(application, 'SUBMITTED must create or update the application tracker');
  assert.equal(application.status, 'APPLIED');
  assert.ok(audits >= 6, `expected audit trail, got ${audits}`);
  assert.equal(events, 1);
  assert.equal(checkpoints, 1);
  assert.equal(userBefore.id, user.id);

  console.log(JSON.stringify({
    ok: true,
    taskId: task.id,
    source: envelope.source,
    mode: envelope.mode,
    approvals: 1,
    state: storedTask.state,
    applicationId: application.id,
    audits,
    events,
    checkpoints,
  }));
} finally {
  server.close();
  await prisma.browserTaskEvent.deleteMany({ where: { userId: `usr_${id}` } }).catch(() => undefined);
  await prisma.browserTaskCheckpoint.deleteMany({ where: { userId: `usr_${id}` } }).catch(() => undefined);
  await prisma.browserTask.deleteMany({ where: { userId: `usr_${id}` } }).catch(() => undefined);
  await prisma.workerDevice.deleteMany({ where: { userId: `usr_${id}` } }).catch(() => undefined);
  await prisma.workerPairingCode.deleteMany({ where: { userId: `usr_${id}` } }).catch(() => undefined);
  await prisma.harnessAuditEvent.deleteMany({ where: { userId: `usr_${id}` } }).catch(() => undefined);
  await prisma.applicationEvent.deleteMany({ where: { application: { userId: `usr_${id}` } } }).catch(() => undefined);
  await prisma.jobApplication.deleteMany({ where: { userId: `usr_${id}` } }).catch(() => undefined);
  await prisma.job.deleteMany({ where: { userId: `usr_${id}` } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: `usr_${id}` } }).catch(() => undefined);
}
