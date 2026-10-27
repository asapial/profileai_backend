import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';

// Isolated service tests: no user database, browser tasks or provider calls.
for (const key of ['BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'ACCESS_TOKEN_SECRET', 'REFRESH_TOKEN_SECRET', 'ACCESS_TOKEN_EXPIRES_IN', 'REFRESH_TOKEN_EXPIRES_IN', 'BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN', 'BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE', 'FRONTEND_URL', 'TOTP_ENCRYPTION_KEY', 'OpenRouter_API_KEY', 'EMAIL_SENDER_SMTP_USER', 'EMAIL_SENDER_SMTP_PASS', 'EMAIL_SENDER_SMTP_HOST', 'EMAIL_SENDER_SMTP_PORT', 'EMAIL_SENDER_SMTP_FROM', 'REDIS_URL', 'MINIO_ENDPOINT', 'MINIO_PORT', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY', 'MINIO_BUCKET', 'MINIO_USE_SSL', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_UPLOAD_PRESET', 'CLOUDINARY_API_SECRET', 'PUPPETEER_SERVICE_URL']) process.env[key] = 'test';
process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
process.env.SKIP_MINIO = 'true';
const { prisma } = await import('../../lib/prisma');
const { claimBrowserTask, reportBrowserTask, controlRun, approveBrowserTask } = await import('./harness.service');
const { claimTask, reportResult, controlTask, decideApproval } = await import('../worker/worker.service');
const { clearSigningKeyCache } = await import('../worker/worker.keys');
const { encryptPrivateKey, generateSigningKeyPair } = await import('../worker/worker.crypto');
const originalTransaction = prisma.$transaction;
const originalDeviceFind = prisma.workerDevice.findFirst;
const originalConfigFind = prisma.platformConfig.findUnique;
afterEach(() => {
  prisma.$transaction = originalTransaction;
  prisma.workerDevice.findFirst = originalDeviceFind;
  prisma.platformConfig.findUnique = originalConfigFind;
  clearSigningKeyCache();
});

test('emergency stop collects worker targets before cancelling their task rows', async () => {
  let state = 'OPENED';
  let captured = false;
  const tx = {
    $queryRaw: async () => [],
    harnessRun: { findFirst: async () => ({ id: 'run', state: 'RUNNING' }), update: async () => ({}), findUnique: async () => ({ id: 'run', state: 'CANCELLED' }) },
    harnessStep: { updateMany: async () => ({ count: 1 }) },
    browserTask: {
      findMany: async () => { assert.equal(state, 'OPENED'); captured = true; return []; },
      updateMany: async () => { state = 'CANCELLED'; return { count: 1 }; },
    },
    harnessAuditEvent: { create: async () => ({}) },
  };
  prisma.$transaction = (async (callback: any) => callback(tx)) as typeof prisma.$transaction;
  assert.equal((await controlRun('owner', 'run', 'emergency-stop'))?.state, 'CANCELLED');
  assert.equal(captured, true);
});

test('companion claims exclude paused runs and tasks assigned to desktop workers', async () => {
  const tx = {
    $queryRaw: async () => [],
    harnessRun: { findMany: async () => [{ id: 'active' }] },
    browserTask: {
      updateMany: async () => ({ count: 0 }),
      findFirst: async ({ where }: any) => {
        assert.equal(where.deviceId, null);
        assert.deepEqual(where.OR, [{ runId: null }, { runId: { in: ['active'] } }]);
        return null;
      },
    },
  };
  prisma.$transaction = (async (callback: any) => callback(tx)) as typeof prisma.$transaction;
  assert.equal(await claimBrowserTask('owner'), null);
});

test('companion blocks an already queued application with an unknown employer', async () => {
  let blocked = false;
  const tx = {
    $queryRaw: async () => [],
    harnessRun: { findMany: async () => [] },
    browserTask: {
      updateMany: async () => ({ count: 0 }),
      findFirst: async () => ({ id: 'task', jobId: 'job', adapter: 'GENERIC' }),
      update: async ({ data }: any) => { blocked = data.state === 'BLOCKED'; return {}; },
    },
    job: { findFirst: async () => ({ company: 'Unknown company' }) },
  };
  prisma.$transaction = (async (callback: any) => callback(tx)) as typeof prisma.$transaction;
  assert.equal(await claimBrowserTask('owner'), null);
  assert.equal(blocked, true);
});

test('late companion reports cannot revive cancelled tasks or duplicate a submitted event', async () => {
  let state = 'CANCELLED';
  const tx = {
    $queryRaw: async () => [],
    browserTask: { findFirst: async () => ({ id: 'task', userId: 'owner', state, deviceId: null, runId: null }) },
  };
  prisma.$transaction = (async (callback: any) => callback(tx)) as typeof prisma.$transaction;
  const report = { state: 'SUBMITTED', adapter: 'TEST', unknownFields: [] };
  await assert.rejects(() => reportBrowserTask('owner', 'task', report), /cancelled/);
  state = 'SUBMITTED';
  assert.equal((await reportBrowserTask('owner', 'task', report)).state, 'SUBMITTED');
});

test('emergency stop cancels paused, takeover and blocked tasks as well as running tasks', async () => {
  const tasks = ['OPENED', 'PAUSED', 'TAKEOVER', 'BLOCKED', 'SUBMITTED'].map(state => ({ state }));
  const tx = {
    $queryRaw: async () => [],
    harnessRun: { findFirst: async () => ({ id: 'run', state: 'PAUSED' }), update: async () => ({}), findUnique: async () => ({ id: 'run', state: 'CANCELLED' }) },
    harnessStep: { updateMany: async () => ({ count: 1 }) },
    browserTask: {
      findMany: async () => [],
      updateMany: async ({ where, data }: any) => {
        for (const task of tasks) if (where.state.in.includes(task.state)) task.state = data.state;
        return { count: 4 };
      },
    },
    harnessAuditEvent: { create: async () => ({}) },
  };
  prisma.$transaction = (async (callback: any) => callback(tx)) as typeof prisma.$transaction;
  await controlRun('owner', 'run', 'emergency-stop');
  assert.deepEqual(tasks.map(task => task.state), ['CANCELLED', 'CANCELLED', 'CANCELLED', 'CANCELLED', 'SUBMITTED']);
});

test('desktop claims exclude queued tasks from paused and cancelled harness runs', async () => {
  const keys = generateSigningKeyPair();
  const encryptedKey = encryptPrivateKey(keys.privateKey);
  prisma.workerDevice.findFirst = (async () => ({ id: 'device', userId: 'owner' })) as any;
  prisma.platformConfig.findUnique = (async ({ where }: any) => ({
    value: where.key === 'worker_server_signing_key_v1' ? encryptedKey : keys.publicKey,
  })) as any;
  const tx = {
    $queryRaw: async () => [],
    harnessRun: {
      findMany: async ({ where }: any) => {
        assert.equal(where.userId, 'owner');
        const runs = [{ id: 'running', state: 'RUNNING' }, { id: 'paused', state: 'PAUSED' }, { id: 'cancelled', state: 'CANCELLED' }];
        return runs.filter(run => where.state.in.includes(run.state));
      },
    },
    browserTask: {
      updateMany: async () => ({ count: 0 }),
      findFirst: async ({ where }: any) => {
        assert.equal(where.userId, 'owner');
        assert.ok(where.AND.some((clause: any) => JSON.stringify(clause) === JSON.stringify({
          OR: [{ runId: null }, { runId: { in: ['running'] } }],
        })), 'desktop claim must constrain parent runs while allowing standalone tasks');
        return null;
      },
    },
  };
  prisma.$transaction = (async (callback: any) => callback(tx)) as typeof prisma.$transaction;
  assert.deepEqual(await claimTask('owner', 'device'), { task: null });
});

test('desktop reports cannot complete tasks whose harness run was cancelled or removed', async () => {
  let run: { state: string } | null = { state: 'CANCELLED' };
  const tx = {
    $queryRaw: async () => [],
    browserTask: { findFirst: async () => ({ id: 'task', userId: 'owner', state: 'PAUSED', deviceId: 'device', runId: 'run' }) },
    harnessRun: { findFirst: async () => run },
  };
  prisma.$transaction = (async (callback: any) => callback(tx)) as typeof prisma.$transaction;
  const report = { state: 'COMPLETED' as const, adapter: 'TEST', unknownFields: [], summary: {} };
  await assert.rejects(() => reportResult('owner', 'device', 'task', report), /harness run was cancelled/);
  run = null;
  await assert.rejects(() => reportResult('owner', 'device', 'task', report), /harness run was cancelled/);
});

test('unassigned paused tasks return to the claimable queue; assigned tasks resume in place', async () => {
  let deviceId: string | null = null;
  const tx = {
    $queryRaw: async () => [],
    browserTask: {
      findFirst: async () => ({ id: 'task', userId: 'owner', state: 'PAUSED', deviceId, runId: null }),
      update: async ({ data }: any) => data,
    },
    harnessAuditEvent: { create: async () => ({}) },
  };
  prisma.$transaction = (async (callback: any) => callback(tx)) as typeof prisma.$transaction;
  assert.equal((await controlTask('owner', 'task', 'resume')).state, 'QUEUED');
  deviceId = 'device';
  assert.equal((await controlTask('owner', 'task', 'resume')).state, 'CLAIMED');
  await assert.rejects(() => controlTask('owner', 'task', 'handback'), /under your control/);
});

test('task resume cannot bypass a paused or cancelled parent run', async () => {
  let state = 'PAUSED';
  const tx = {
    $queryRaw: async () => [],
    browserTask: { findFirst: async () => ({ id: 'task', state: 'PAUSED', deviceId: 'device', runId: 'run' }) },
    harnessRun: { findFirst: async () => ({ state }) },
  };
  prisma.$transaction = (async (callback: any) => callback(tx)) as typeof prisma.$transaction;
  await assert.rejects(() => controlTask('owner', 'task', 'resume'), /active harness run/);
  state = 'CANCELLED';
  await assert.rejects(() => controlTask('owner', 'task', 'resume'), /active harness run/);
});

test('companion retry cannot bypass desktop approval or revive a cancelled run', async () => {
  let deviceId: string | null = 'device';
  const tx = {
    $queryRaw: async () => [],
    browserTask: { findFirst: async () => ({ id: 'task', state: 'WAITING_FOR_USER', deviceId, runId: 'run' }) },
    harnessRun: { findFirst: async () => ({ state: 'CANCELLED' }) },
  };
  prisma.$transaction = (async (callback: any) => callback(tx)) as typeof prisma.$transaction;
  await assert.rejects(() => approveBrowserTask('owner', 'task'), /local worker approval queue/);
  deviceId = null;
  await assert.rejects(() => approveBrowserTask('owner', 'task'), /already finished/);
});

test('late approval cannot take over a stopped task', async () => {
  const tx = {
    $queryRaw: async () => [],
    workerApproval: { findFirst: async () => ({ id: 'approval', taskId: 'task', state: 'PENDING', expiresAt: new Date(Date.now() + 60_000) }) },
    browserTask: { findFirst: async () => ({ id: 'task', state: 'CANCELLED', runId: null }) },
  };
  prisma.$transaction = (async (callback: any) => callback(tx)) as typeof prisma.$transaction;
  await assert.rejects(() => decideApproval('owner', 'approval', 'TAKEOVER', ''), /already finished/);
});

test('completed run cannot be changed to cancelled by a stale stop control', async () => {
  const tx = { $queryRaw: async () => [], harnessRun: { findFirst: async () => ({ id: 'run', state: 'COMPLETED' }) } };
  prisma.$transaction = (async (callback: any) => callback(tx)) as typeof prisma.$transaction;
  await assert.rejects(() => controlRun('owner', 'run', 'emergency-stop'), /already finished/);
});
