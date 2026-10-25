import type { NextFunction, Request, Response } from 'express';
import AppError from '../../errorHelpers/AppError';
import { prisma } from '../../lib/prisma';
import { verifyRequestSignature, NonceCache } from './worker.crypto';
import { sessionFromRawAccessToken, touchWorkerDevice } from './worker.service';

type WorkerIdentity = {
  userId: string;
  deviceId: string;
  sessionId: string;
  publicKey: string;
};

declare global {
  namespace Express {
    interface Request {
      worker?: WorkerIdentity;
    }
  }
}

const replayCache = new NonceCache();

const signedParts = (req: Request) => {
  const deviceId = typeof req.headers['x-worker-device'] === 'string' ? req.headers['x-worker-device'] : '';
  const timestamp = typeof req.headers['x-worker-timestamp'] === 'string' ? req.headers['x-worker-timestamp'] : '';
  const nonce = typeof req.headers['x-worker-nonce'] === 'string' ? req.headers['x-worker-nonce'] : '';
  const signature = typeof req.headers['x-worker-signature'] === 'string' ? req.headers['x-worker-signature'] : '';
  if (!deviceId || !timestamp || !nonce || !signature) {
    throw new AppError(401, 'Signed worker request headers are required.');
  }
  const path = req.originalUrl.split('?')[0] ?? req.path;
  return { deviceId, timestamp, nonce, signature, path };
};

const verifySignature = (
  req: Request,
  publicKey: string,
  parts: ReturnType<typeof signedParts>,
  userId: string,
) => {
  const check = verifyRequestSignature(publicKey, {
    method: req.method,
    path: parts.path,
    body: req.body ?? {},
    deviceId: parts.deviceId,
    timestamp: parts.timestamp,
    nonce: parts.nonce,
    signature: parts.signature,
  });
  if (!check.valid) throw new AppError(401, check.reason);
  if (!replayCache.remember(`${userId}:${parts.deviceId}`, parts.nonce)) {
    throw new AppError(401, 'Worker request nonce has already been used.');
  }
};

export async function workerSignedAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const parts = signedParts(req);
    const device = await prisma.workerDevice.findFirst({
      where: { id: parts.deviceId, status: 'ACTIVE', revokedAt: null },
    });
    if (!device) throw new AppError(401, 'Worker device is revoked or unknown.');
    verifySignature(req, device.publicKey, parts, device.userId);
    req.worker = { userId: device.userId, deviceId: device.id, sessionId: '', publicKey: device.publicKey };
    next();
  } catch (error) {
    next(error);
  }
}

export async function workerAccessAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const raw = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!raw?.startsWith('paiw_at_')) throw new AppError(401, 'Worker access token is required.');
    const session = await sessionFromRawAccessToken(raw);
    if (!session) throw new AppError(401, 'Worker access token is invalid, expired or revoked.');
    const parts = signedParts(req);
    if (parts.deviceId !== session.deviceId) throw new AppError(401, 'Signed device does not match the access token.');
    verifySignature(req, session.device.publicKey, parts, session.device.userId);
    req.worker = { userId: session.device.userId, deviceId: session.deviceId, sessionId: session.id, publicKey: session.device.publicKey };
    const now = Date.now();
    if (!session.lastUsedAt || now - session.lastUsedAt.getTime() > 60_000) {
      await touchWorkerDevice(session.deviceId, session.device.userId, req.ip);
      await prisma.workerSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function resetWorkerReplayCache(): void {
  replayCache.clear();
}
