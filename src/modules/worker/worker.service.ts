import { randomBytes } from 'node:crypto';
import { Prisma } from '../../../prisma/generated/prisma/client';
import AppError from '../../errorHelpers/AppError';
import { prisma } from '../../lib/prisma';
import { ownerLock } from '../career/career.service';
import { discover, importPosting } from '../career/career.sources';
import { jobSearchProviders, normalizeJobSearchQuery } from '../harness/harness.jobs';
import {
  assertEd25519PublicKey,
  canonicalJson,
  pairingCodeHash,
  publicKeyFingerprint,
  randomPairingCode,
  randomToken,
  sha256Hex,
  signTaskEnvelope,
  tokenHash,
  type TaskEnvelope,
  type TaskEnvelopeInput,
} from './worker.crypto';
import { getServerSigningKey } from './worker.keys';
import {
  accessSessionStatus,
  newSessionMaterial,
  pairingCodeStatus,
  refreshSessionStatus,
} from './worker.trust';
import {
  classifyTaskSource,
  ensureWorkerPolicies,
  mapTaskMode,
  policyForSource,
} from './worker.policy';
import type {
  WorkerAuthPollInput,
  WorkerAuthStartInput,
  WorkerCaptureTaskInput,
  WorkerConsentInput,
  WorkerPairInput,
  WorkerResultInput,
  WorkerSearchTaskInput,
  HybridJobSearchInput,
} from './worker.schema';
import type { z } from 'zod';
import type { workerCapturedListingSchema, workerCheckpointSchema, workerEventSchema } from './worker.schema';

const PAIRING_TTL_MS = 10 * 60_000;
const TASK_TTL_MS = 15 * 60_000;

type StoredEvent = z.infer<typeof workerEventSchema>;
type StoredCheckpoint = z.infer<typeof workerCheckpointSchema>;

const asObject = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const asStringArray = (value: unknown): string[] => (
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : []
);

const readString = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback;

const audit = (userId: string, action: string, entityType: string, entityId: string | null, outcome: string, metadata: Record<string, unknown> = {}) =>
  prisma.harnessAuditEvent.create({
    data: {
      userId,
      action,
      entityType,
      ...(entityId ? { entityId } : {}),
      outcome,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });

export async function createPairingCode(userId: string, nameHint?: string) {
  const code = randomPairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
  await prisma.$transaction([
    prisma.workerPairingCode.updateMany({
      where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date() },
    }),
    prisma.workerPairingCode.create({
      data: {
        userId,
        codeHash: pairingCodeHash(code),
        expiresAt,
        ...(nameHint ? { nameHint } : {}),
      },
    }),
  ]);
  await audit(userId, 'WORKER_PAIRING_CODE_CREATED', 'WorkerPairingCode', null, 'SUCCESS', { expiresAt: expiresAt.toISOString() });
  return { code, expiresAt: expiresAt.toISOString(), expiresInSeconds: Math.floor(PAIRING_TTL_MS / 1000) };
}

export async function pairWorker(input: WorkerPairInput, ip?: string) {
  try {
    assertEd25519PublicKey(input.publicKey);
  } catch (error) {
    throw new AppError(400, error instanceof Error ? error.message : 'Invalid worker public key.');
  }
  const codeHash = pairingCodeHash(input.code);
  const pairing = await prisma.workerPairingCode.findUnique({ where: { codeHash } });
  if (!pairing) throw new AppError(401, 'Pairing code is invalid.');
  const status = pairingCodeStatus(pairing);
  if (status === 'USED') throw new AppError(409, 'Pairing code has already been used.');
  if (status === 'EXPIRED') throw new AppError(410, 'Pairing code has expired. Create a new code in ProfileAI.');

  const session = newSessionMaterial();
  const serverKey = await getServerSigningKey();

  const result = await prisma.$transaction(async tx => {
    const claimed = await tx.workerPairingCode.updateMany({
      where: { id: pairing.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (!claimed.count) throw new AppError(409, 'Pairing code has already been used.');

    const device = await issueDeviceSession(tx, {
      userId: pairing.userId,
      name: input.name,
      platform: input.platform,
      appVersion: input.appVersion,
      publicKey: input.publicKey,
      capabilities: input.capabilities,
      ip,
    }, session);
    await tx.workerPairingCode.update({ where: { id: pairing.id }, data: { deviceId: device.id } });
    await tx.harnessAuditEvent.create({
      data: {
        userId: pairing.userId,
        action: 'WORKER_DEVICE_PAIRED',
        entityType: 'WorkerDevice',
        entityId: device.id,
        outcome: 'SUCCESS',
        metadata: { name: input.name, platform: input.platform, appVersion: input.appVersion, fingerprint: publicKeyFingerprint(input.publicKey) },
      },
    });
    return { deviceId: device.id, deviceName: device.name };
  });

  return {
    ...result,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    accessExpiresAt: session.accessExpiresAt.toISOString(),
    serverPublicKey: serverKey.publicKey,
    serverName: 'ProfileAI Cloud',
  };
}

interface DeviceSessionInput {
  userId: string;
  name: string;
  platform: string;
  appVersion: string;
  publicKey: string;
  capabilities: string[];
  ip?: string | undefined;
}

async function issueDeviceSession(
  tx: Prisma.TransactionClient,
  input: DeviceSessionInput,
  session = newSessionMaterial(),
) {
  const fingerprint = publicKeyFingerprint(input.publicKey);
  const existing = await tx.workerDevice.findUnique({ where: { publicKeyFingerprint: fingerprint } });
  if (existing && existing.userId !== input.userId) {
    throw new AppError(409, 'This device key is already paired to another account.');
  }
  const device = existing
    ? await tx.workerDevice.update({
        where: { id: existing.id },
        data: {
          name: input.name,
          platform: input.platform,
          appVersion: input.appVersion,
          capabilities: input.capabilities,
          status: 'ACTIVE',
          revokedAt: null,
          pairedAt: new Date(),
          lastSeenAt: new Date(),
          ...(input.ip ? { lastIp: input.ip } : {}),
        },
      })
    : await tx.workerDevice.create({
        data: {
          userId: input.userId,
          name: input.name,
          platform: input.platform,
          appVersion: input.appVersion,
          publicKey: input.publicKey,
          publicKeyFingerprint: fingerprint,
          capabilities: input.capabilities,
          ...(input.ip ? { lastIp: input.ip } : {}),
        },
      });

  if (existing) {
    await tx.workerSession.updateMany({ where: { deviceId: device.id, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  await tx.workerSession.create({
    data: {
      deviceId: device.id,
      accessTokenHash: session.accessTokenHash,
      refreshTokenHash: session.refreshTokenHash,
      accessExpiresAt: session.accessExpiresAt,
      refreshExpiresAt: session.refreshExpiresAt,
    },
  });
  return device;
}

const AUTH_REQUEST_TTL_MS = 10 * 60_000;

function publicAuthRequest(request: {
  id: string;
  deviceName: string;
  platform: string;
  appVersion: string;
  publicKeyFingerprint: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
}) {
  return {
    id: request.id,
    deviceName: request.deviceName,
    platform: request.platform,
    appVersion: request.appVersion,
    fingerprint: request.publicKeyFingerprint,
    status: request.status,
    expiresAt: request.expiresAt.toISOString(),
    createdAt: request.createdAt.toISOString(),
    canApprove: request.status === 'PENDING' && request.expiresAt.getTime() > Date.now(),
  };
}

function authVerificationUrl(requestId: string): string {
  const frontend = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${frontend}/dashboard/worker/authorize?request=${encodeURIComponent(requestId)}`;
}

/**
 * Starts a browser-based device authorization (RFC 8628 style). The desktop
 * keeps the secret, the browser only sees the request id, and the account
 * owner approves the device while signed in to ProfileAI.
 */
export async function startWorkerAuth(input: WorkerAuthStartInput) {
  try {
    assertEd25519PublicKey(input.publicKey);
  } catch (error) {
    throw new AppError(400, error instanceof Error ? error.message : 'Invalid worker public key.');
  }
  const secret = randomToken('paiw_auth_');
  const expiresAt = new Date(Date.now() + AUTH_REQUEST_TTL_MS);
  const request = await prisma.workerAuthRequest.create({
    data: {
      requestHash: sha256Hex(secret),
      deviceName: input.deviceName,
      platform: input.platform,
      appVersion: input.appVersion,
      publicKey: input.publicKey,
      publicKeyFingerprint: publicKeyFingerprint(input.publicKey),
      capabilities: input.capabilities,
      expiresAt,
    },
  });
  return {
    requestId: request.id,
    secret,
    verificationUrl: authVerificationUrl(request.id),
    expiresAt: expiresAt.toISOString(),
    expiresInSeconds: Math.floor(AUTH_REQUEST_TTL_MS / 1000),
  };
}

export async function getWorkerAuthRequest(requestId: string) {
  const request = await prisma.workerAuthRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new AppError(404, 'Authorization request not found.');
  if (request.status === 'PENDING' && request.expiresAt <= new Date()) {
    const expired = await prisma.workerAuthRequest.update({
      where: { id: request.id },
      data: { status: 'EXPIRED' },
    });
    return publicAuthRequest(expired);
  }
  return publicAuthRequest(request);
}

export async function decideWorkerAuth(requestId: string, decision: 'APPROVE' | 'DENY', userId: string) {
  const request = await prisma.workerAuthRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new AppError(404, 'Authorization request not found.');
  if (request.status === 'PENDING' && request.expiresAt <= new Date()) {
    await prisma.workerAuthRequest.update({ where: { id: request.id }, data: { status: 'EXPIRED' } });
    throw new AppError(410, 'This authorization request has expired. Start again from the desktop app.');
  }
  if (request.status !== 'PENDING') {
    throw new AppError(409, `This authorization request is already ${request.status.toLowerCase()}.`);
  }
  const updated = await prisma.workerAuthRequest.updateMany({
    where: { id: request.id, status: 'PENDING', expiresAt: { gt: new Date() } },
    data: {
      status: decision === 'APPROVE' ? 'APPROVED' : 'DENIED',
      userId: decision === 'APPROVE' ? userId : null,
      approvedAt: new Date(),
    },
  });
  if (!updated.count) throw new AppError(409, 'This authorization request was already decided or expired.');
  const fresh = await prisma.workerAuthRequest.findUniqueOrThrow({ where: { id: request.id } });
  await audit(userId, decision === 'APPROVE' ? 'WORKER_AUTH_APPROVED' : 'WORKER_AUTH_DENIED', 'WorkerAuthRequest', request.id, 'SUCCESS', {
    deviceName: request.deviceName,
    platform: request.platform,
    fingerprint: request.publicKeyFingerprint,
  });
  return publicAuthRequest(fresh);
}

export async function completeWorkerAuth(input: WorkerAuthPollInput, ip?: string) {
  const request = await prisma.workerAuthRequest.findUnique({ where: { id: input.requestId } });
  if (!request || request.requestHash !== sha256Hex(input.secret)) {
    throw new AppError(401, 'Authorization request secret is invalid.');
  }
  if (request.status === 'DENIED') return { status: 'DENIED' as const };
  if (request.status === 'EXPIRED' || (request.status === 'PENDING' && request.expiresAt <= new Date())) {
    if (request.status !== 'EXPIRED') {
      await prisma.workerAuthRequest.update({ where: { id: request.id }, data: { status: 'EXPIRED' } });
    }
    return { status: 'EXPIRED' as const, expiresAt: request.expiresAt.toISOString() };
  }
  if (request.status === 'PENDING') return { status: 'PENDING' as const, expiresAt: request.expiresAt.toISOString() };
  if (request.status !== 'APPROVED' || !request.userId) {
    throw new AppError(409, 'This authorization request has already been used. Start again from the desktop app.');
  }

  const session = newSessionMaterial();
  const serverKey = await getServerSigningKey();
  const result = await prisma.$transaction(async tx => {
    const claimed = await tx.workerAuthRequest.updateMany({
      where: { id: request.id, status: 'APPROVED', usedAt: null, expiresAt: { gt: new Date() } },
      data: { status: 'USED', usedAt: new Date() },
    });
    if (!claimed.count) throw new AppError(409, 'This authorization request has already been used.');
    const device = await issueDeviceSession(tx, {
      userId: request.userId!,
      name: request.deviceName,
      platform: request.platform,
      appVersion: request.appVersion,
      publicKey: request.publicKey,
      capabilities: asStringArray(request.capabilities),
      ip,
    }, session);
    await tx.harnessAuditEvent.create({
      data: {
        userId: request.userId!,
        action: 'WORKER_DEVICE_PAIRED',
        entityType: 'WorkerDevice',
        entityId: device.id,
        outcome: 'SUCCESS',
        metadata: {
          name: request.deviceName,
          platform: request.platform,
          appVersion: request.appVersion,
          fingerprint: request.publicKeyFingerprint,
          method: 'browser_device_authorization',
        },
      },
    });
    return { deviceId: device.id, deviceName: device.name };
  });

  return {
    status: 'APPROVED' as const,
    ...result,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    accessExpiresAt: session.accessExpiresAt.toISOString(),
    serverPublicKey: serverKey.publicKey,
    serverName: 'ProfileAI Cloud',
  };
}

export async function refreshWorkerSession(input: { deviceId: string; refreshToken: string }, signedDeviceId: string) {  if (input.deviceId !== signedDeviceId) throw new AppError(401, 'Refresh request device does not match the signature.');
  const session = await prisma.workerSession.findUnique({
    where: { refreshTokenHash: tokenHash(input.refreshToken) },
    include: { device: true },
  });
  if (!session || session.deviceId !== input.deviceId) throw new AppError(401, 'Worker refresh token is invalid.');
  const status = refreshSessionStatus(session);
  if (status === 'DEVICE_REVOKED') throw new AppError(401, 'Worker device is revoked.');
  if (status !== 'ACTIVE') throw new AppError(401, 'Worker refresh token is expired or revoked.');

  const tokens = newSessionMaterial();
  const accessToken = tokens.accessToken;
  const refreshToken = tokens.refreshToken;
  const accessExpiresAt = tokens.accessExpiresAt;
  const refreshExpiresAt = tokens.refreshExpiresAt;
  const rotated = await prisma.workerSession.updateMany({
    where: { id: session.id, refreshTokenHash: tokenHash(input.refreshToken), revokedAt: null, refreshExpiresAt: { gt: new Date() } },
    data: {
      accessTokenHash: tokenHash(accessToken),
      refreshTokenHash: tokenHash(refreshToken),
      accessExpiresAt,
      refreshExpiresAt,
      lastUsedAt: new Date(),
      rotatedAt: new Date(),
    },
  });
  if (!rotated.count) throw new AppError(401, 'Worker refresh token was already rotated.');
  await prisma.workerDevice.update({ where: { id: session.deviceId }, data: { lastSeenAt: new Date() } });
  await audit(session.device.userId, 'WORKER_TOKEN_ROTATED', 'WorkerDevice', session.deviceId, 'SUCCESS');
  return {
    accessToken,
    refreshToken,
    accessExpiresAt: accessExpiresAt.toISOString(),
    refreshExpiresAt: refreshExpiresAt.toISOString(),
  };
}

export async function sessionFromRawAccessToken(rawToken: string) {
  if (!rawToken.startsWith('paiw_at_')) return null;
  const session = await prisma.workerSession.findUnique({
    where: { accessTokenHash: tokenHash(rawToken) },
    include: { device: true },
  });
  if (!session || accessSessionStatus(session) !== 'ACTIVE') return null;
  return session;
}

export async function touchWorkerDevice(deviceId: string, userId: string, ip?: string) {
  await prisma.workerDevice.updateMany({
    where: { id: deviceId, userId, status: 'ACTIVE', revokedAt: null },
    data: { lastSeenAt: new Date(), ...(ip ? { lastIp: ip } : {}) },
  });
}

export async function heartbeat(userId: string, deviceId: string, ip?: string) {
  await touchWorkerDevice(deviceId, userId, ip);
  return { ok: true, serverTime: new Date().toISOString() };
}

export async function revokeDevice(userId: string, deviceId: string) {
  const result = await prisma.$transaction(async tx => {
    const updated = await tx.workerDevice.updateMany({
      where: { id: deviceId, userId, revokedAt: null },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    if (!updated.count) throw new AppError(404, 'Worker device not found.');
    await tx.workerSession.updateMany({ where: { deviceId, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.workerApproval.updateMany({ where: { deviceId, state: 'PENDING' }, data: { state: 'REVOKED', decidedAt: new Date(), decidedBy: userId, decisionNote: 'Device revoked.' } });
    await tx.harnessAuditEvent.create({
      data: { userId, action: 'WORKER_DEVICE_REVOKED', entityType: 'WorkerDevice', entityId: deviceId, outcome: 'SUCCESS', metadata: { message: 'All worker sessions and pending approvals were revoked.' } },
    });
    return tx.workerDevice.findUnique({ where: { id: deviceId }, select: { id: true, name: true, revokedAt: true } });
  });
  return result;
}

function hostAllowed(hostname: string, domains: readonly string[]): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return domains.some(domain => domain === '*' || host === domain || host.endsWith(`.${domain}`));
}

function sourcePolicyOrThrow(source: string) {
  try {
    return policyForSource(source);
  } catch {
    throw new AppError(400, `Unknown worker source: ${source}.`);
  }
}

export async function listConsents(userId: string) {
  await ensureWorkerPolicies();
  const [policies, rows] = await Promise.all([
    prisma.sitePolicy.findMany({ where: { enabled: true }, orderBy: { source: 'asc' } }),
    prisma.workerSiteConsent.findMany({ where: { userId } }),
  ]);
  const bySource = new Map(rows.map(row => [row.source, row]));
  return policies.map(policy => {
    const row = bySource.get(policy.source);
    return {
      source: policy.source,
      name: policy.name,
      level: policy.level,
      domains: asStringArray(policy.domains),
      searchCapability: policy.search,
      scrollCapability: policy.scroll,
      captureCapability: policy.extraction,
      maxPagesLimit: policy.maxPagesPerRun,
      search: row?.search ?? false,
      scroll: row?.scroll ?? false,
      capture: row?.capture ?? false,
      maxPages: row?.maxPages ?? 1,
      acknowledgedRisk: row?.acknowledgedRisk ?? false,
      grantedAt: row?.grantedAt?.toISOString() ?? null,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
      revokedAt: row?.revokedAt?.toISOString() ?? null,
    };
  });
}

export async function upsertConsent(userId: string, source: string, input: WorkerConsentInput) {
  const policy = sourcePolicyOrThrow(source);
  if ((input.search || input.scroll || input.capture) && !input.acknowledgedRisk) {
    throw new AppError(400, 'Explicit risk acknowledgement is required to enable browser search, scrolling, or capture.');
  }
  if (!policy.search && input.search) throw new AppError(403, `${policy.name} does not support browser search.`);
  if (!policy.scroll && input.scroll) throw new AppError(403, `${policy.name} does not support scrolling.`);
  if (!policy.extraction && input.capture) throw new AppError(403, `${policy.name} does not support page capture.`);
  if (input.scroll && !input.search) throw new AppError(400, 'Scrolling requires search permission on the same source.');
  if (input.maxPages > 1 && !input.scroll) throw new AppError(400, 'Enable scrolling before raising the page cap above one.');
  const maxPages = Math.max(1, Math.min(input.maxPages, policy.maxPagesPerRun, 10));
  const consent = await prisma.workerSiteConsent.upsert({
    where: { userId_source: { userId, source } },
    create: {
      userId,
      source,
      search: input.search,
      scroll: input.scroll,
      capture: input.capture,
      maxPages,
      acknowledgedRisk: input.acknowledgedRisk,
    },
    update: {
      search: input.search,
      scroll: input.scroll,
      capture: input.capture,
      maxPages,
      acknowledgedRisk: input.acknowledgedRisk,
      revokedAt: input.search || input.scroll || input.capture ? null : new Date(),
    },
  });
  await audit(userId, 'WORKER_CONSENT_UPDATED', 'WorkerSiteConsent', consent.id, 'SUCCESS', {
    source,
    search: consent.search,
    scroll: consent.scroll,
    capture: consent.capture,
    maxPages: consent.maxPages,
    acknowledgedRisk: consent.acknowledgedRisk,
  });
  return consent;
}

async function activeConsent(userId: string, source: string) {
  const consent = await prisma.workerSiteConsent.findUnique({ where: { userId_source: { userId, source } } });
  if (!consent || consent.revokedAt || !consent.acknowledgedRisk) return null;
  return consent;
}

function buildSearchUrl(source: string, query: string | undefined, startUrl: string | undefined): string {
  if (startUrl) return startUrl;
  if (!query) throw new AppError(400, 'A search query or start URL is required.');
  if (source === 'LINKEDIN') return `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}`;
  if (source === 'FACEBOOK') return `https://www.facebook.com/search/posts?q=${encodeURIComponent(query)}`;
  if (source === 'BDJOBS') return `https://bdjobs.com/h/jobs/?search=${encodeURIComponent(query)}`;
  if (source === 'REMOTIVE') return `https://remotive.com/remote-jobs?search=${encodeURIComponent(query)}`;
  throw new AppError(400, `A start URL is required for ${source} searches.`);
}

function normalizeTaskUrl(raw: string, policy: ReturnType<typeof policyForSource>) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError(400, 'Task URL is invalid.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new AppError(400, 'Task URL must use HTTP or HTTPS.');
  if (url.username || url.password) throw new AppError(400, 'Task URL must not contain credentials.');
  if (!hostAllowed(url.hostname, policy.domains)) {
    throw new AppError(403, `${policy.name} only allows its reviewed domains (${policy.domains.join(', ')}).`);
  }
  return url;
}

export async function createSearchTask(userId: string, input: WorkerSearchTaskInput) {
  if (!input.consentAcknowledged) {
    throw new AppError(400, 'Confirm the search and scrolling permission before queueing a browser task.');
  }
  const requestedSource = input.source ?? (input.startUrl ? classifyTaskSource('SEARCH', input.startUrl, null) : null);
  if (!requestedSource) throw new AppError(400, 'Choose a source or provide a start URL so the worker can classify it.');
  const targetUrl = buildSearchUrl(requestedSource, input.query, input.startUrl);
  const source = classifyTaskSource('SEARCH', targetUrl, requestedSource);
  const policy = sourcePolicyOrThrow(source);
  if (!policy.search) throw new AppError(403, `${policy.name} does not support browser search.`);
  const consent = await activeConsent(userId, source);
  if (!consent || !consent.search) {
    throw new AppError(403, `Grant search permission for ${policy.name} from the worker dashboard first.`);
  }
  const url = normalizeTaskUrl(targetUrl, policy);
  const maxPages = Math.max(1, Math.min(input.maxPages, consent.maxPages, policy.maxPagesPerRun));
  if (maxPages > 1 && !consent.scroll) {
    throw new AppError(403, `Grant scrolling permission for ${policy.name} before requesting more than one page.`);
  }
  if (input.scrollRounds > 0 && !consent.scroll) {
    throw new AppError(403, `Grant scrolling permission for ${policy.name} before asking the worker to scroll.`);
  }
  const allowedDomains = [...new Set([url.hostname.toLowerCase(), ...policy.domains.filter(domain => domain !== '*')])].slice(0, 40);
  const now = new Date();
  const task = await prisma.browserTask.create({
    data: {
      userId,
      jobId: null,
      runId: null,
      adapter: 'SEARCH',
      source,
      targetUrl: url.toString(),
      mode: input.mode,
      priority: 60,
      expiresAt: new Date(now.getTime() + 30 * 60_000),
      payload: {
        taskType: 'DISCOVER',
        search: {
          query: input.query ?? '',
          startUrl: url.toString(),
          source,
          scrollRounds: input.scrollRounds,
          maxResults: input.maxResults,
          consentId: consent.id,
        },
        allowedDomains,
        limits: {
          maxPages,
          maxActions: Math.max(20, maxPages * 20),
          maxDurationMs: 15 * 60_000,
          maxConcurrentPages: 1,
        },
      } as Prisma.InputJsonValue,
    },
  });
  await audit(userId, 'WORKER_SEARCH_QUEUED', 'BrowserTask', task.id, 'SUCCESS', {
    source,
    targetUrl: task.targetUrl,
    maxPages,
    maxResults: input.maxResults,
    scrollRounds: input.scrollRounds,
  });
  return task;
}

const OPEN_SEARCH_PROVIDERS = new Set(['REMOTIVE', 'JOBICY', 'ARBEITNOW']);
const CAREER_BOARD_PROVIDERS = new Set(['GREENHOUSE', 'LEVER']);
const PRIVATE_BROWSER_SOURCES = new Set(['FACEBOOK', 'LINKEDIN', 'BDJOBS']);

export async function runHybridJobSearch(userId: string, input: HybridJobSearchInput) {
  const query = normalizeJobSearchQuery(input.query);
  const jobIds = new Set<string>();
  const taskIds: string[] = [];
  const failures: Array<{ source: string; message: string }> = [];
  const selected = [...new Set(input.sources)];
  const perSourceLimit = Math.max(1, Math.min(15, Math.ceil(input.maxResults / selected.length)));

  for (const source of selected.filter(value => OPEN_SEARCH_PROVIDERS.has(value))) {
    const provider = jobSearchProviders.find(row => row.id.toUpperCase() === source);
    if (!provider) continue;
    try {
      const found = await provider.search(userId, query, perSourceLimit, input.maximumAgeDays);
      found.forEach(id => jobIds.add(id));
    } catch (error) {
      failures.push({ source, message: error instanceof Error ? error.message : `${source} search failed.` });
    }
  }

  for (const source of selected.filter(value => CAREER_BOARD_PROVIDERS.has(value))) {
    const boards = await prisma.careerSource.findMany({
      where: { enabled: true, provider: source as 'GREENHOUSE' | 'LEVER' },
      orderBy: { lastCheckedAt: 'asc' },
      take: 10,
      select: { id: true },
    });
    for (const board of boards) {
      if (jobIds.size >= input.maxResults) break;
      try {
        const result = await discover(board.id, userId);
        const tokens = query.toLowerCase().split(/[^a-z0-9+#.]+/).filter(token => token.length >= 3);
        const matches = result.jobs.filter(job => {
          const title = job.title.toLowerCase();
          return !tokens.length || tokens.some(token => title.includes(token));
        }).slice(0, perSourceLimit);
        for (const job of matches) {
          const imported = await importPosting(userId, board.id, job.externalId);
          jobIds.add(imported.id);
        }
      } catch (error) {
        failures.push({ source, message: error instanceof Error ? error.message : `${source} board search failed.` });
      }
    }
  }

  const privateSources = selected.filter(value => PRIVATE_BROWSER_SOURCES.has(value));
  if (privateSources.length && !input.privateSourceConsent) {
    throw new AppError(400, 'Confirm private-source browser access before queueing Facebook, LinkedIn, or BDJobs.');
  }
  for (const source of privateSources) {
    try {
      const task = await createSearchTask(userId, {
        source: source as WorkerSearchTaskInput['source'],
        query,
        maxPages: 1,
        maxResults: perSourceLimit,
        scrollRounds: 0,
        mode: 'RESEARCH',
        consentAcknowledged: true,
      });
      taskIds.push(task.id);
    } catch (error) {
      failures.push({ source, message: error instanceof Error ? error.message : `${source} browser task failed.` });
    }
  }

  await audit(userId, 'HYBRID_JOB_SEARCH_STARTED', 'Job', null, failures.length ? 'PARTIAL' : 'SUCCESS', {
    query,
    sources: selected,
    savedJobs: jobIds.size,
    queuedBrowserTasks: taskIds.length,
    failures,
  });
  return {
    query,
    savedJobIds: [...jobIds].slice(0, input.maxResults),
    queuedTaskIds: taskIds,
    failures,
  };
}

export async function createCaptureTask(userId: string, input: WorkerCaptureTaskInput) {
  if (!input.consentAcknowledged) {
    throw new AppError(400, 'Confirm the capture permission before queueing a browser task.');
  }
  const requestedSource = input.source ?? classifyTaskSource('SEARCH', input.url, null);
  const source = classifyTaskSource('SEARCH', input.url, requestedSource);
  const policy = sourcePolicyOrThrow(source);
  if (!policy.extraction) throw new AppError(403, `${policy.name} does not support page capture.`);
  const consent = await activeConsent(userId, source);
  if (!consent || !consent.capture) {
    throw new AppError(403, `Grant page-capture permission for ${policy.name} from the worker dashboard first.`);
  }
  const url = normalizeTaskUrl(input.url, policy);
  const allowedDomains = [...new Set([url.hostname.toLowerCase(), ...policy.domains.filter(domain => domain !== '*')])].slice(0, 40);
  const task = await prisma.browserTask.create({
    data: {
      userId,
      jobId: null,
      runId: null,
      adapter: 'SEARCH',
      source,
      targetUrl: url.toString(),
      mode: 'RESEARCH',
      priority: 55,
      expiresAt: new Date(Date.now() + 30 * 60_000),
      payload: {
        taskType: 'CAPTURE',
        search: { source, maxResults: 1, consentId: consent.id },
        allowedDomains,
        limits: { maxPages: 1, maxActions: 20, maxDurationMs: 10 * 60_000, maxConcurrentPages: 1 },
      } as Prisma.InputJsonValue,
    },
  });
  await audit(userId, 'WORKER_CAPTURE_QUEUED', 'BrowserTask', task.id, 'SUCCESS', {
    source,
    targetUrl: task.targetUrl,
  });
  return task;
}

export async function listCapturedListings(userId: string, limit = 20) {
  const take = Math.max(1, Math.min(100, Math.floor(limit)));
  const rows = await prisma.capturedListing.findMany({
    where: { userId },
    orderBy: { capturedAt: 'desc' },
    take,
    select: {
      id: true,
      source: true,
      canonicalUrl: true,
      payload: true,
      capturedAt: true,
      deviceId: true,
    },
  });
  return rows.map(row => {
    const payload = asObject(row.payload);
    return {
      id: row.id,
      source: row.source,
      canonicalUrl: row.canonicalUrl,
      title: readString(payload.title),
      company: readString(payload.company),
      location: readString(payload.location),
      capturedAt: row.capturedAt.toISOString(),
      deviceId: row.deviceId,
    };
  });
}

function envelopeInputForTask(
  task: {
    id: string; deviceId: string | null; runId: string | null; adapter: string; source: string | null;
    targetUrl: string; mode: string; payload: Prisma.JsonValue;
  },
  deviceId: string,
  policyVersion: string,
  now: Date,
): TaskEnvelopeInput {
  let url: URL;
  try {
    url = new URL(task.targetUrl);
  } catch {
    throw new AppError(409, 'Browser task has an invalid target URL.');
  }
  if (!['https:', 'http:'].includes(url.protocol)) throw new AppError(409, 'Browser task target must use HTTP or HTTPS.');
  const source = classifyTaskSource(task.adapter, task.targetUrl, task.source);
  const policy = policyForSource(source);
  const payload = asObject(task.payload);
  const requestedDomains = asStringArray(payload.allowedDomains).map(item => item.trim().toLowerCase()).filter(Boolean);
  const policyDomains = policy.domains.filter(domain => domain !== '*');
  const allowedDomains = [...new Set([url.hostname.toLowerCase(), ...policyDomains, ...requestedDomains])].slice(0, 60);
  const limits = asObject(payload.limits);
  const requestedPages = typeof limits.maxPages === 'number' ? Math.floor(limits.maxPages) : 12;
  const rawDocuments = Array.isArray(payload.documents) ? payload.documents : [];
  const documents = rawDocuments.flatMap(item => {
    const document = asObject(item);
    const kind = readString(document.kind);
    if (!document.id || !document.name || !['RESUME', 'COVER_LETTER', 'EMAIL', 'ANSWER'].includes(kind)) return [];
    return [{
      id: String(document.id).slice(0, 200),
      kind: kind as 'RESUME' | 'COVER_LETTER' | 'EMAIL' | 'ANSWER',
      name: String(document.name).slice(0, 300),
      version: typeof document.version === 'number' ? Math.max(1, Math.floor(document.version)) : 1,
      ...(typeof document.sha256 === 'string' && /^[a-f0-9]{64}$/.test(document.sha256) ? { sha256: document.sha256 } : {}),
      ...(typeof document.url === 'string' ? { url: document.url } : {}),
    }];
  }).slice(0, 20);
  const taskType = readString(payload.taskType, task.adapter === 'SEARCH' ? 'DISCOVER' : 'PREPARE');
  const allowedTypes = ['DISCOVER', 'CAPTURE', 'PREPARE', 'VERIFY', 'SUBMIT'] as const;
  const type = allowedTypes.includes(taskType as typeof allowedTypes[number]) ? taskType as typeof allowedTypes[number] : 'PREPARE';
  return {
    protocolVersion: 1,
    taskId: task.id,
    deviceId,
    runId: task.runId,
    type,
    mode: mapTaskMode(task.mode),
    source,
    targetUrl: task.targetUrl,
    allowedDomains: allowedDomains.length ? allowedDomains : [url.hostname.toLowerCase()],
    limits: {
      maxPages: Math.max(1, Math.min(requestedPages, policy.maxPagesPerRun)),
      maxActions: typeof limits.maxActions === 'number' ? Math.max(1, Math.min(2000, Math.floor(limits.maxActions))) : 80,
      maxDurationMs: typeof limits.maxDurationMs === 'number' ? Math.max(1_000, Math.min(3_600_000, Math.floor(limits.maxDurationMs))) : 600_000,
      maxConcurrentPages: typeof limits.maxConcurrentPages === 'number' ? Math.max(1, Math.min(3, Math.floor(limits.maxConcurrentPages))) : 1,
    },
    policyVersion,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TASK_TTL_MS).toISOString(),
    nonce: randomBytes(18).toString('hex'),
    payload,
    documents,
  };
}

export async function claimTask(userId: string, deviceId: string): Promise<{ task: TaskEnvelope | null }> {
  const device = await prisma.workerDevice.findFirst({ where: { id: deviceId, userId, status: 'ACTIVE', revokedAt: null } });
  if (!device) throw new AppError(401, 'Worker device is not active.');
  const serverKey = await getServerSigningKey();
  return prisma.$transaction(async tx => {
    await ownerLock(tx, userId);
    await tx.browserTask.updateMany({
      where: { userId, deviceId, state: 'CLAIMED', claimedAt: { lt: new Date(Date.now() - TASK_TTL_MS) } },
      data: { state: 'WAITING_FOR_USER', error: 'The worker did not finish this task in time. Verify the page before retrying.' },
    });

    for (let candidates = 0; candidates < 8; candidates += 1) {
      const task = await tx.browserTask.findFirst({
        where: {
          userId,
          state: 'QUEUED',
          mode: { not: 'AUTO_APPLY' },
          AND: [
            { OR: [{ deviceId: null }, { deviceId }] },
            { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          ],
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });
      if (!task) return { task: null };
      const source = classifyTaskSource(task.adapter, task.targetUrl, task.source);
      const claimPolicy = policyForSource(source);
      const taskPayload = asObject(task.payload);
      const taskType = readString(taskPayload.taskType, task.adapter === 'SEARCH' ? 'DISCOVER' : 'PREPARE');
      const assistedRead = taskType === 'DISCOVER' || taskType === 'CAPTURE';
      const consent = assistedRead
        ? await tx.workerSiteConsent.findUnique({ where: { userId_source: { userId, source } } })
        : null;
      const capability = taskType === 'CAPTURE' ? claimPolicy.extraction : claimPolicy.search;
      const consentAllows = Boolean(
        consent
        && !consent.revokedAt
        && consent.acknowledgedRisk
        && capability
        && (taskType === 'CAPTURE' ? consent.capture : consent.search),
      );
      if (assistedRead && !consentAllows) {
        const blockedAt = new Date();
        await tx.browserTask.update({
          where: { id: task.id },
          data: {
            state: 'BLOCKED',
            source,
            finishedAt: blockedAt,
            error: `${claimPolicy.name} needs an explicit ${taskType === 'CAPTURE' ? 'page-capture' : 'search'} permission from the account owner before a worker can claim it.`,
          },
        });
        await tx.harnessAuditEvent.create({
          data: {
            userId,
            runId: task.runId,
            action: 'WORKER_TASK_BLOCKED',
            entityType: 'BrowserTask',
            entityId: task.id,
            outcome: 'BLOCKED',
            metadata: { source, level: claimPolicy.level, taskType, message: 'User permission is missing for this assisted read task.' },
          },
        });
        continue;
      }
      if (!assistedRead && (claimPolicy.level !== 'A' || claimPolicy.userPresenceRequired)) {
        const blockedAt = new Date();
        await tx.browserTask.update({
          where: { id: task.id },
          data: {
            state: 'BLOCKED',
            source,
            finishedAt: blockedAt,
            error: `${claimPolicy.name} requires an explicit user-assisted session and cannot be claimed automatically.`,
          },
        });
        await tx.harnessAuditEvent.create({
          data: {
            userId,
            runId: task.runId,
            action: 'WORKER_TASK_BLOCKED',
            entityType: 'BrowserTask',
            entityId: task.id,
            outcome: 'BLOCKED',
            metadata: { source, level: claimPolicy.level, message: 'User-assisted source is not eligible for automatic claims.' },
          },
        });
        continue;
      }
      const now = new Date();
      let envelope: TaskEnvelope;
      try {
        const limits = asObject(taskPayload.limits);
        const consentedPages = assistedRead && consent
          ? Math.max(1, Math.min(
              typeof limits.maxPages === 'number' ? Math.floor(limits.maxPages) : 1,
              consent.maxPages,
              claimPolicy.maxPagesPerRun,
            ))
          : undefined;
        const envelopeTask = consentedPages === undefined
          ? task
          : {
              ...task,
              payload: {
                ...taskPayload,
                limits: { ...limits, maxPages: taskType === 'CAPTURE' ? 1 : consentedPages },
              } as Prisma.JsonValue,
            };
        envelope = signTaskEnvelope(envelopeInputForTask(envelopeTask, deviceId, claimPolicy.version, now), serverKey.privateKey);
      } catch (error) {
        await tx.browserTask.update({
          where: { id: task.id },
          data: {
            state: 'BLOCKED',
            error: error instanceof Error ? error.message : 'Task policy validation failed.',
            finishedAt: now,
          },
        });
        await tx.harnessAuditEvent.create({
          data: { userId, runId: task.runId, action: 'WORKER_TASK_BLOCKED', entityType: 'BrowserTask', entityId: task.id, outcome: 'BLOCKED', metadata: { message: error instanceof Error ? error.message : 'Task policy validation failed.' } },
        });
        continue;
      }
      const issuedExpiry = new Date(envelope.expiresAt);
      const claimed = await tx.browserTask.updateMany({
        where: { id: task.id, state: 'QUEUED', OR: [{ deviceId: null }, { deviceId }] },
        data: {
          state: 'CLAIMED',
          deviceId,
          claimedAt: now,
          expiresAt: issuedExpiry,
          source,
          signature: envelope.signature,
          policyVersion: envelope.policyVersion,
          revision: { increment: 1 },
          attempt: { increment: 1 },
          progress: 5,
          error: null,
        },
      });
      if (!claimed.count) continue;
      await tx.harnessAuditEvent.create({
        data: { userId, runId: task.runId, action: 'WORKER_TASK_CLAIMED', entityType: 'BrowserTask', entityId: task.id, outcome: 'CLAIMED', metadata: { deviceId, source, policyVersion: envelope.policyVersion, revision: task.revision + 1 } },
      });
      return { task: envelope };
    }
    return { task: null };
  });
}

export async function recordEvents(userId: string, deviceId: string, taskId: string, events: StoredEvent[]) {
  const task = await prisma.browserTask.findFirst({ where: { id: taskId, userId } });
  if (!task) throw new AppError(404, 'Browser task not found.');
  if (task.deviceId && task.deviceId !== deviceId) throw new AppError(403, 'Browser task belongs to another worker.');
  if (events.some(event => event.taskId !== taskId)) throw new AppError(400, 'Every event must belong to the task in the route.');
  const progressEvent = [...events].reverse().find(event => event.type === 'PROGRESS');
  const progressValue = progressEvent ? progressEvent.data.progress : undefined;
  const progress = typeof progressValue === 'number' && Number.isFinite(progressValue)
    ? Math.max(0, Math.min(100, Math.floor(progressValue)))
    : task.progress;
  const created = await prisma.browserTaskEvent.createMany({
    data: events.map(event => ({
      taskId,
      userId,
      seq: event.seq,
      type: event.type,
      message: event.message,
      data: event.data as Prisma.InputJsonValue,
      redacted: event.redacted,
      createdAt: Number.isFinite(Date.parse(event.at)) ? new Date(event.at) : new Date(),
    })),
    skipDuplicates: true,
  });
  if (created.count) {
    await prisma.browserTask.update({
      where: { id: taskId },
      data: { progress },
    });
    const latest = events[events.length - 1]!;
    await prisma.harnessAuditEvent.create({
      data: { userId, runId: task.runId, action: 'WORKER_TASK_EVENTS', entityType: 'BrowserTask', entityId: taskId, outcome: 'SUCCESS', metadata: { accepted: created.count, latestType: latest.type, latestSeq: latest.seq } },
    });
  }
  const last = await prisma.browserTaskEvent.findFirst({ where: { taskId }, orderBy: { seq: 'desc' }, select: { seq: true } });
  return { accepted: created.count, lastSeq: last?.seq ?? null };
}

export async function recordCheckpoint(userId: string, deviceId: string, checkpoint: StoredCheckpoint) {
  const task = await prisma.browserTask.findFirst({ where: { id: checkpoint.taskId, userId } });
  if (!task) throw new AppError(404, 'Browser task not found.');
  if (task.deviceId && task.deviceId !== deviceId) throw new AppError(403, 'Browser task belongs to another worker.');
  if (checkpoint.deviceId !== deviceId) throw new AppError(403, 'Checkpoint device does not match the signed request.');
  if (checkpoint.submitted) {
    const approval = await prisma.workerApproval.findFirst({
      where: { taskId: task.id, userId, kind: 'SUBMIT', state: 'APPROVED', expiresAt: { gt: new Date() } },
      orderBy: { decidedAt: 'desc' },
    });
    if (!approval) throw new AppError(409, 'A submitted checkpoint requires a live, approved submit approval.');
  }
  const saved = await prisma.browserTaskCheckpoint.upsert({
    where: { taskId_sequence: { taskId: checkpoint.taskId, sequence: checkpoint.sequence } },
    create: {
      taskId: checkpoint.taskId,
      deviceId,
      userId,
      sequence: checkpoint.sequence,
      state: checkpoint.state,
      url: checkpoint.url,
      step: checkpoint.step,
      observationHash: checkpoint.observationHash,
      completedActions: checkpoint.completedActions as Prisma.InputJsonValue,
      submitted: checkpoint.submitted,
      metadata: checkpoint.metadata as Prisma.InputJsonValue,
      createdAt: Number.isFinite(Date.parse(checkpoint.createdAt)) ? new Date(checkpoint.createdAt) : new Date(),
    },
    update: {
      state: checkpoint.state,
      url: checkpoint.url,
      step: checkpoint.step,
      observationHash: checkpoint.observationHash,
      completedActions: checkpoint.completedActions as Prisma.InputJsonValue,
      submitted: checkpoint.submitted,
      metadata: checkpoint.metadata as Prisma.InputJsonValue,
    },
  });
  await prisma.harnessAuditEvent.create({
    data: { userId, runId: task.runId, action: 'WORKER_TASK_CHECKPOINT', entityType: 'BrowserTask', entityId: task.id, outcome: checkpoint.submitted ? 'SUBMITTED' : 'SUCCESS', metadata: { sequence: checkpoint.sequence, state: checkpoint.state, submitted: checkpoint.submitted } },
  });
  return saved;
}

export async function reportResult(userId: string, deviceId: string, taskId: string, report: WorkerResultInput) {
  return prisma.$transaction(async tx => {
    await ownerLock(tx, userId);
    const task = await tx.browserTask.findFirst({ where: { id: taskId, userId } });
    if (!task) throw new AppError(404, 'Browser task not found.');
    if (task.deviceId && task.deviceId !== deviceId) throw new AppError(403, 'Browser task belongs to another worker.');
    const terminal = ['COMPLETED', 'SUBMITTED', 'BLOCKED', 'FAILED', 'CANCELLED'].includes(report.state);
    if (['COMPLETED', 'SUBMITTED', 'BLOCKED', 'FAILED', 'CANCELLED'].includes(task.state)) {
      if (task.state === report.state) return task;
      throw new AppError(409, `This task already finished as ${task.state} and cannot change to ${report.state}.`);
    }
    const now = new Date();
    const policy = policyForSource(classifyTaskSource(task.adapter, task.targetUrl, task.source));

    if (report.state === 'SUBMITTED') {
      if (!['REVIEW_SUBMIT', 'ASSISTED'].includes(task.mode)) throw new AppError(409, 'This task was not started in assisted submit mode. Nothing may be submitted.');
      if (!policy.submit || policy.level !== 'A') throw new AppError(409, `${policy.name} does not permit automated submission.`);
      const approval = await tx.workerApproval.findFirst({
        where: { userId, taskId: task.id, kind: 'SUBMIT', state: 'APPROVED', expiresAt: { gt: new Date() } },
        orderBy: { decidedAt: 'desc' },
      });
      if (!approval) throw new AppError(409, 'Submission requires a live, approved submit approval.');
      const confirmationUrl = report.confirmation?.url?.trim() ?? '';
      const confirmationText = report.confirmation?.text?.trim() ?? '';
      if (!confirmationUrl && !confirmationText) throw new AppError(409, 'A submitted result requires visible confirmation evidence.');
      if (confirmationUrl) {
        let parsed: URL;
        try {
          parsed = new URL(confirmationUrl);
        } catch {
          throw new AppError(400, 'The submitted confirmation URL is invalid.');
        }
        if (!['https:', 'http:'].includes(parsed.protocol)) throw new AppError(400, 'The submitted confirmation URL must use HTTP or HTTPS.');
      }
    }

    const updated = await tx.browserTask.update({
      where: { id: task.id },
      data: {
        state: report.state,
        result: report as unknown as Prisma.InputJsonValue,
        error: report.blocker ?? null,
        progress: report.progress ?? (report.state === 'SUBMITTED' || report.state === 'COMPLETED' ? 100 : task.progress),
        finishedAt: terminal ? now : null,
      },
    });

    if (report.state === 'SUBMITTED') {
      if (!task.jobId) throw new AppError(409, 'Submitted browser task has no job.');
      const job = await tx.job.findFirst({ where: { id: task.jobId, userId } });
      if (!job) throw new AppError(404, 'Job not found for submitted task.');
      const application = task.applicationId
        ? await tx.jobApplication.findFirst({ where: { id: task.applicationId, userId } })
        : await tx.jobApplication.findFirst({ where: { userId, jobId: job.id } });
      const saved = application
        ? await tx.jobApplication.update({ where: { id: application.id }, data: { status: 'APPLIED', appliedAt: now } })
        : await tx.jobApplication.create({ data: { userId, jobId: job.id, company: job.company, role: job.title, jobUrl: job.canonicalUrl, location: job.location, status: 'APPLIED' } });
      await tx.applicationEvent.create({
        data: { userId, applicationId: saved.id, type: 'STATUS_CHANGE', payload: { source: 'LOCAL_BROWSER_WORKER', taskId: task.id, confirmation: report.confirmation ?? null } as Prisma.InputJsonValue },
      });
      await tx.browserTask.update({ where: { id: task.id }, data: { applicationId: saved.id } });
    }

    await tx.harnessAuditEvent.create({
      data: {
        userId,
        runId: task.runId,
        action: 'WORKER_TASK_REPORTED',
        entityType: 'BrowserTask',
        entityId: task.id,
        outcome: report.state,
        metadata: {
          adapter: report.adapter || task.adapter,
          deviceId,
          unknownFields: report.unknownFields,
          message: report.blocker ?? (report.state === 'SUBMITTED' ? 'Application submitted after explicit approval.' : report.state === 'COMPLETED' ? 'Task completed without submission.' : `Task is ${report.state.toLowerCase().replaceAll('_', ' ')}.`),
        },
      },
    });

    if (task.runId) {
      const remaining = await tx.browserTask.count({ where: { runId: task.runId, state: { in: ['QUEUED', 'CLAIMED', 'OPENED', 'FILLED', 'WAITING_FOR_USER', 'BLOCKED'] } } });
      if (!remaining) {
        const failed = await tx.browserTask.count({ where: { runId: task.runId, state: 'FAILED' } });
        await tx.harnessRun.updateMany({
          where: { id: task.runId, userId, state: 'WAITING_FOR_USER' },
          data: { state: failed ? 'PARTIAL' : 'COMPLETED', finishedAt: now, error: failed ? 'One or more browser tasks failed.' : null },
        });
      }
    }
    return updated;
  });
}

export async function requestApproval(userId: string, deviceId: string, taskId: string, input: {
  taskId: string;
  deviceId: string;
  kind: string;
  summary: string;
  targetUrl: string;
  risk: string;
  expiresAt: string;
  evidence: Record<string, unknown>;
}) {
  if (input.taskId !== taskId) throw new AppError(400, 'Approval task does not match the route.');
  if (input.deviceId !== deviceId) throw new AppError(403, 'Approval device does not match the signed request.');
  const task = await prisma.browserTask.findFirst({ where: { id: taskId, userId } });
  if (!task) throw new AppError(404, 'Browser task not found.');
  if (task.deviceId && task.deviceId !== deviceId) throw new AppError(403, 'Browser task belongs to another worker.');
  const policy = policyForSource(classifyTaskSource(task.adapter, task.targetUrl, task.source));
  if (input.kind === 'SUBMIT' && (!policy.submit || policy.level !== 'A')) {
    throw new AppError(409, `${policy.name} does not permit submission. No approval was created.`);
  }
  if (input.kind === 'SUBMIT' && !['REVIEW_SUBMIT', 'ASSISTED'].includes(task.mode)) {
    throw new AppError(409, 'Submit approval can only be requested in assisted submit mode.');
  }
  const expiresAt = new Date(input.expiresAt);
  if (!Number.isFinite(expiresAt.getTime())) throw new AppError(400, 'Approval expiry is invalid.');
  if (expiresAt <= new Date()) throw new AppError(410, 'Approval request has already expired.');
  if (expiresAt.getTime() > Date.now() + 24 * 60 * 60_000) throw new AppError(400, 'Approval expiry cannot exceed 24 hours.');
  const existing = await prisma.workerApproval.findFirst({
    where: { taskId, userId, deviceId, kind: input.kind, summary: input.summary, state: 'PENDING', expiresAt: { gt: new Date() } },
  });
  if (existing) return { id: existing.id, expiresAt: existing.expiresAt.toISOString(), reused: true };
  const requestedId = readString(input.evidence.approvalId);
  const approvalId = /^apr_[A-Za-z0-9-]{8,100}$/.test(requestedId) ? requestedId : undefined;
  if (approvalId) {
    const existingById = await prisma.workerApproval.findUnique({ where: { id: approvalId } });
    if (existingById) {
      if (existingById.userId !== userId || existingById.taskId !== taskId) throw new AppError(409, 'Approval id is already used by another task.');
      return { id: existingById.id, expiresAt: existingById.expiresAt.toISOString(), reused: true };
    }
  }
  const actionHash = sha256Hex(canonicalJson({ taskId, deviceId, kind: input.kind, summary: input.summary, targetUrl: input.targetUrl }));
  const approval = await prisma.workerApproval.create({
    data: {
      ...(approvalId ? { id: approvalId } : {}),
      userId,
      deviceId,
      taskId,
      kind: input.kind,
      summary: input.summary,
      targetUrl: input.targetUrl,
      risk: input.risk,
      actionHash,
      evidence: input.evidence as Prisma.InputJsonValue,
      expiresAt,
    },
  });
  await prisma.browserTask.updateMany({
    where: { id: taskId, state: { in: ['CLAIMED', 'OPENED', 'FILLED'] } },
    data: { state: 'WAITING_FOR_USER', progress: 70 },
  });
  await prisma.harnessAuditEvent.create({
    data: { userId, runId: task.runId, action: 'WORKER_APPROVAL_REQUESTED', entityType: 'WorkerApproval', entityId: approval.id, outcome: 'PENDING', metadata: { taskId, kind: input.kind, risk: input.risk, expiresAt: expiresAt.toISOString() } },
  });
  return { id: approval.id, expiresAt: approval.expiresAt.toISOString(), reused: false };
}

type ApprovalDecision = 'APPROVED' | 'REJECTED' | 'TAKEOVER';

async function decideApprovalRecord(
  userId: string,
  approvalId: string,
  decision: ApprovalDecision,
  note: string,
  options: { deviceId?: string } = {},
) {
  const result = await prisma.$transaction(async tx => {
    const approval = await tx.workerApproval.findFirst({ where: { id: approvalId, userId } });
    if (!approval) throw new AppError(404, 'Approval not found.');
    if (options.deviceId && approval.deviceId !== options.deviceId) throw new AppError(403, 'Approval belongs to another worker device.');
    if (approval.state !== 'PENDING') throw new AppError(409, 'Approval has already been decided.');
    if (approval.expiresAt <= new Date()) {
      await tx.workerApproval.update({ where: { id: approval.id }, data: { state: 'EXPIRED', decidedAt: new Date(), decidedBy: userId, decisionNote: 'Expired before a decision.' } });
      throw new AppError(410, 'Approval has expired. The worker will not act on it.');
    }
    const task = await tx.browserTask.findFirst({ where: { id: approval.taskId, userId } });
    if (!task) throw new AppError(404, 'Browser task not found.');
    if (options.deviceId && task.deviceId && task.deviceId !== options.deviceId) throw new AppError(403, 'Browser task belongs to another worker.');
    const now = new Date();
    const updated = await tx.workerApproval.update({
      where: { id: approval.id },
      data: { state: decision, decidedAt: now, decidedBy: userId, decisionNote: note },
    });
    if (decision === 'APPROVED' && approval.kind === 'SUBMIT') {
      await tx.browserTask.update({ where: { id: approval.taskId }, data: { approvedAt: now } });
    }
    if (decision === 'TAKEOVER') {
      await tx.browserTask.update({ where: { id: approval.taskId }, data: { state: 'TAKEOVER' } });
    }
    await tx.harnessAuditEvent.create({
      data: {
        userId,
        runId: task.runId,
        action: 'WORKER_APPROVAL_DECIDED',
        entityType: 'WorkerApproval',
        entityId: approval.id,
        outcome: decision,
        metadata: {
          taskId: approval.taskId,
          kind: approval.kind,
          note,
          actor: options.deviceId ? 'desktop' : 'web',
          ...(options.deviceId ? { deviceId: options.deviceId } : {}),
        },
      },
    });
    return updated;
  });
  return result;
}

export async function decideApproval(userId: string, approvalId: string, decision: ApprovalDecision, note: string) {
  return decideApprovalRecord(userId, approvalId, decision, note);
}

/**
 * Desktop decisions still resolve against the server record, so the submit
 * guard can never be bypassed by a local-only approval. The worker device may
 * only decide approvals that belong to the same device.
 */
export async function decideApprovalFromDevice(userId: string, deviceId: string, approvalId: string, decision: ApprovalDecision, note: string) {
  return decideApprovalRecord(userId, approvalId, decision, note, { deviceId });
}

export async function controlTask(userId: string, taskId: string, action: 'pause' | 'resume' | 'stop' | 'takeover' | 'handback') {
  const result = await prisma.$transaction(async tx => {
    const task = await tx.browserTask.findFirst({ where: { id: taskId, userId } });
    if (!task) throw new AppError(404, 'Browser task not found.');
    if (['COMPLETED', 'SUBMITTED', 'FAILED', 'CANCELLED'].includes(task.state)) throw new AppError(409, 'This task has already finished.');
    const now = new Date();
    const state = action === 'pause' ? 'PAUSED' : action === 'resume' || action === 'handback' ? 'CLAIMED' : action === 'takeover' ? 'TAKEOVER' : 'CANCELLED';
    const updated = await tx.browserTask.update({
      where: { id: task.id },
      data: {
        state,
        ...(action === 'stop' ? { finishedAt: now, error: 'Stopped by the account owner.' } : {}),
        ...(action === 'takeover' ? { error: 'The account owner took control of the browser.' } : {}),
      },
    });
    await tx.harnessAuditEvent.create({
      data: { userId, runId: task.runId, action: `WORKER_TASK_${action.toUpperCase()}`, entityType: 'BrowserTask', entityId: task.id, outcome: state, metadata: { deviceId: task.deviceId, previousState: task.state } },
    });
    return updated;
  });
  return result;
}

function dayStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function overview(userId: string) {
  await prisma.workerApproval.updateMany({
    where: { userId, state: 'PENDING', expiresAt: { lt: new Date() } },
    data: { state: 'EXPIRED', decidedAt: new Date(), decisionNote: 'Expired before a decision.' },
  });
  await ensureWorkerPolicies();
  const policies = await prisma.sitePolicy.findMany({ where: { enabled: true }, orderBy: { source: 'asc' } });
  const [devices, tasks, approvals, events, audits, capturedCount, submissionsToday] = await Promise.all([
    prisma.workerDevice.findMany({ where: { userId }, orderBy: { pairedAt: 'desc' } }),
    prisma.browserTask.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: { id: true, jobId: true, runId: true, adapter: true, source: true, targetUrl: true, mode: true, state: true, progress: true, error: true, createdAt: true, updatedAt: true, finishedAt: true, deviceId: true },
    }),
    prisma.workerApproval.findMany({ where: { userId }, orderBy: [{ state: 'asc' }, { requestedAt: 'desc' }], take: 30 }),
    prisma.browserTaskEvent.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, taskId: true, seq: true, type: true, message: true, createdAt: true } }),
    prisma.harnessAuditEvent.findMany({ where: { userId, action: { startsWith: 'WORKER_' } }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.browserTaskEvent.count({ where: { userId, type: 'JOB_CAPTURED' } }),
    prisma.browserTask.count({ where: { userId, state: 'SUBMITTED', finishedAt: { gte: dayStart() } } }),
  ]);
  const jobIds = [...new Set(tasks.map(task => task.jobId).filter((jobId): jobId is string => Boolean(jobId)))];
  const jobs = jobIds.length
    ? await prisma.job.findMany({ where: { userId, id: { in: jobIds } }, select: { id: true, title: true, company: true, location: true } })
    : [];
  const [consents, capturedListings] = await Promise.all([
    listConsents(userId),
    listCapturedListings(userId, 12),
  ]);
  const onlineCutoff = Date.now() - 2 * 60_000;
  const activeTasks = tasks.filter(task => ['QUEUED', 'CLAIMED', 'OPENED', 'FILLED', 'WAITING_FOR_USER', 'PAUSED', 'TAKEOVER'].includes(task.state));
  const pendingApprovals = approvals.filter(approval => approval.state === 'PENDING');
  const activeDevices = devices.filter(device => device.status === 'ACTIVE' && !device.revokedAt);
  return {
    status: !activeDevices.length ? 'NOT_PAIRED' : activeDevices.some(device => device.lastSeenAt && device.lastSeenAt.getTime() > onlineCutoff) ? 'ONLINE' : 'OFFLINE',
    serverTime: new Date().toISOString(),
    summary: {
      devices: activeDevices.length,
      pendingApprovals: pendingApprovals.length,
      activeTasks: activeTasks.length,
      capturedListings: capturedCount,
      submissionsToday,
      policyCount: policies.length,
    },
    devices: devices.map(device => ({
      id: device.id,
      name: device.name,
      platform: device.platform,
      appVersion: device.appVersion,
      publicKeyFingerprint: device.publicKeyFingerprint,
      capabilities: device.capabilities,
      status: device.status,
      pairedAt: device.pairedAt.toISOString(),
      lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
      lastIp: device.lastIp,
      online: device.status === 'ACTIVE' && Boolean(device.lastSeenAt && device.lastSeenAt.getTime() > onlineCutoff),
    })),
    tasks: tasks.map(task => ({
      ...task,
      source: task.source ?? classifyTaskSource(task.adapter, task.targetUrl),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      finishedAt: task.finishedAt?.toISOString() ?? null,
      job: jobs.find(job => job.id === task.jobId) ?? null,
    })),
    approvals: approvals.map(approval => ({
      id: approval.id,
      taskId: approval.taskId,
      kind: approval.kind,
      state: approval.state,
      summary: approval.summary,
      targetUrl: approval.targetUrl,
      risk: approval.risk,
      evidence: approval.evidence,
      requestedAt: approval.requestedAt.toISOString(),
      expiresAt: approval.expiresAt.toISOString(),
      decidedAt: approval.decidedAt?.toISOString() ?? null,
      expired: approval.state === 'PENDING' && approval.expiresAt <= new Date(),
    })),
    events: events.map(event => ({ ...event, createdAt: event.createdAt.toISOString() })),
    audits: audits.map(event => ({ ...event, createdAt: event.createdAt.toISOString() })),
    consents,
    capturedListings,
    policies: policies.map(policy => ({
      source: policy.source,
      name: policy.name,
      version: policy.version,
      level: policy.level,
      domains: policy.domains,
      discovery: policy.discovery,
      search: policy.search,
      scroll: policy.scroll,
      extraction: policy.extraction,
      formFill: policy.formFill,
      submit: policy.submit,
      userPresenceRequired: policy.userPresenceRequired,
      maxPagesPerRun: policy.maxPagesPerRun,
      maxRequestsPerMinute: policy.maxRequestsPerMinute,
      reviewedAt: policy.reviewedAt.toISOString(),
      reviewReference: policy.reviewReference,
      notes: policy.notes,
      enabled: policy.enabled,
    })),
  };
}

export async function listPolicies() {
  let policies = await prisma.sitePolicy.findMany({ where: { enabled: true }, orderBy: { source: 'asc' } });
  if (!policies.length) {
    await ensureWorkerPolicies();
    policies = await prisma.sitePolicy.findMany({ where: { enabled: true }, orderBy: { source: 'asc' } });
  }
  return policies;
}

export async function listDevices(userId: string) {
  return prisma.workerDevice.findMany({ where: { userId }, orderBy: { pairedAt: 'desc' } });
}

export async function listApprovals(userId: string, state?: string) {
  return prisma.workerApproval.findMany({
    where: { userId, ...(state ? { state } : {}) },
    orderBy: { requestedAt: 'desc' },
    take: 100,
  });
}

/**
 * REST fallback for approval decisions when the worker socket is unavailable.
 * Returns pending requests plus decisions made in the last day so a worker
 * that reconnects after a push failure can still resolve its local approval.
 */
export async function listApprovalsForDevice(userId: string, deviceId: string) {
  return prisma.workerApproval.findMany({
    where: {
      userId,
      deviceId,
      OR: [
        { state: 'PENDING' },
        {
          state: { in: ['APPROVED', 'REJECTED', 'TAKEOVER'] },
          decidedAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) },
        },
      ],
    },
    orderBy: { requestedAt: 'desc' },
    take: 100,
    select: {
      id: true,
      taskId: true,
      kind: true,
      state: true,
      summary: true,
      expiresAt: true,
      decidedAt: true,
      decisionNote: true,
    },
  });
}

export async function saveCapturedListings(userId: string, deviceId: string, listings: z.infer<typeof workerCapturedListingSchema>[]) {
  let accepted = 0;
  for (const listing of listings) {
    const fingerprint = sha256Hex(canonicalJson({
      source: listing.source,
      canonicalUrl: listing.canonicalUrl,
      title: listing.title,
      company: listing.company,
    }));
    const result = await prisma.capturedListing.upsert({
      where: { userId_fingerprint: { userId, fingerprint } },
      create: {
        userId,
        deviceId,
        source: listing.source,
        externalId: listing.externalId,
        fingerprint,
        canonicalUrl: listing.canonicalUrl,
        payload: listing as unknown as Prisma.InputJsonValue,
        capturedAt: Number.isFinite(Date.parse(listing.capturedAt)) ? new Date(listing.capturedAt) : new Date(),
      },
      update: {
        externalId: listing.externalId,
        canonicalUrl: listing.canonicalUrl,
        payload: listing as unknown as Prisma.InputJsonValue,
        capturedAt: Number.isFinite(Date.parse(listing.capturedAt)) ? new Date(listing.capturedAt) : new Date(),
      },
    });
    const sourceType = listing.source === 'GREENHOUSE'
      ? 'GREENHOUSE'
      : listing.source === 'LEVER'
        ? 'LEVER'
        : listing.source === 'COMPANY_CAREER' || listing.source === 'ASHBY'
          ? 'COMPANY_CAREER'
          : 'USER_URL';
    const workplaceType = listing.workplaceType === 'ONSITE'
      ? 'ON_SITE'
      : listing.workplaceType === 'UNKNOWN'
        ? 'UNSPECIFIED'
        : listing.workplaceType;
    const publishedAt = listing.publishedAt && Number.isFinite(Date.parse(listing.publishedAt))
      ? new Date(listing.publishedAt)
      : null;
    const existingJob = await prisma.job.findFirst({ where: { userId, canonicalUrl: listing.canonicalUrl } });
    const jobData = {
      title: listing.title,
      company: listing.company,
      description: listing.description,
      location: listing.location || null,
      workplaceType: workplaceType as 'REMOTE' | 'HYBRID' | 'ON_SITE' | 'UNSPECIFIED',
      employmentType: listing.employmentType || null,
      salaryMin: listing.salaryMin,
      salaryMax: listing.salaryMax,
      salaryCurrency: listing.salaryCurrency || null,
      canonicalUrl: listing.canonicalUrl,
      sourceName: `Local Worker · ${listing.source}`,
      sourceType: sourceType as 'GREENHOUSE' | 'LEVER' | 'COMPANY_CAREER' | 'USER_URL',
      lifecycle: 'ACTIVE' as const,
      publishedAt,
      lastVerifiedAt: new Date(),
      contentHash: fingerprint,
      isPrivate: true,
    };
    if (existingJob) await prisma.job.update({ where: { id: existingJob.id }, data: jobData });
    else await prisma.job.create({ data: { userId, ...jobData } });
    if (result) accepted += 1;
  }
  await audit(userId, 'WORKER_LISTINGS_CAPTURED', 'CapturedListing', null, 'SUCCESS', { deviceId, accepted });
  return { accepted, skipped: Math.max(0, listings.length - accepted) };
}

export async function authenticateWorkerToken(rawToken: string) {
  return sessionFromRawAccessToken(rawToken);
}
