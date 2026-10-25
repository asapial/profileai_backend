import { randomToken, tokenHash } from './worker.crypto';

/**
 * Pure trust predicates used by the worker service. Keeping them separate
 * makes expiry and revocation behavior testable without a database.
 */

export type PairingCodeStatus = 'VALID' | 'USED' | 'EXPIRED';

export function pairingCodeStatus(
  code: { usedAt?: Date | null; expiresAt: Date },
  now = new Date(),
): PairingCodeStatus {
  if (code.usedAt) return 'USED';
  if (code.expiresAt <= now) return 'EXPIRED';
  return 'VALID';
}

export type SessionStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'DEVICE_REVOKED';

export function accessSessionStatus(
  session: { revokedAt?: Date | null; accessExpiresAt: Date; device: { status: string; revokedAt?: Date | null } },
  now = new Date(),
): SessionStatus {
  if (session.device.status !== 'ACTIVE' || session.device.revokedAt) return 'DEVICE_REVOKED';
  if (session.revokedAt) return 'REVOKED';
  if (session.accessExpiresAt <= now) return 'EXPIRED';
  return 'ACTIVE';
}

export function refreshSessionStatus(
  session: { revokedAt?: Date | null; refreshExpiresAt: Date; device: { status: string; revokedAt?: Date | null } },
  now = new Date(),
): SessionStatus {
  if (session.device.status !== 'ACTIVE' || session.device.revokedAt) return 'DEVICE_REVOKED';
  if (session.revokedAt) return 'REVOKED';
  if (session.refreshExpiresAt <= now) return 'EXPIRED';
  return 'ACTIVE';
}

export function newSessionMaterial(now = Date.now()) {
  const accessToken = randomToken('paiw_at_');
  const refreshToken = randomToken('paiw_rt_');
  return {
    accessToken,
    refreshToken,
    accessTokenHash: tokenHash(accessToken),
    refreshTokenHash: tokenHash(refreshToken),
    accessExpiresAt: new Date(now + 24 * 60 * 60_000),
    refreshExpiresAt: new Date(now + 30 * 24 * 60 * 60_000),
  };
}
