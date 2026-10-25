import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';

/**
 * Server-side mirror of profileai_worker/packages/protocol/src/crypto.ts.
 * Keep canonicalJson and the two signature payloads byte-for-byte compatible
 * with the worker package. The desktop pins the server public key at pairing.
 */

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item === undefined ? null : item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
  return `{${entries.join(',')}}`;
}

export function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(prefix: string): string {
  return `${prefix}${randomBytes(32).toString('base64url')}`;
}

export function randomPairingCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  const raw = Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function normalizePairingCode(code: string): string {
  return code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

export function pairingCodeHash(code: string): string {
  return sha256Hex(`profileai-worker-pairing:${normalizePairingCode(code)}`);
}

export function tokenHash(token: string): string {
  return sha256Hex(token);
}

export function publicKeyFingerprint(publicKeyPem: string): string {
  return sha256Hex(publicKeyPem.replace(/\s+/g, ''));
}

export function generateSigningKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

export function assertEd25519PublicKey(publicKeyPem: string): void {
  let type: string | undefined;
  try {
    type = createPublicKey(publicKeyPem).asymmetricKeyType;
  } catch {
    throw new Error('The worker public key is not a valid PEM key.');
  }
  if (type !== 'ed25519') throw new Error('The worker public key must be an Ed25519 key.');
}

export interface RequestSigningInput {
  method: string;
  path: string;
  body?: unknown;
  timestamp?: string;
  nonce?: string;
  deviceId: string;
}

export function requestSignaturePayload(input: RequestSigningInput): string {
  return [
    input.method.toUpperCase(),
    input.path,
    sha256Hex(canonicalJson(input.body ?? {})),
    input.timestamp ?? '',
    input.nonce ?? '',
  ].join('\n');
}

export type SignatureCheck = { valid: true } | { valid: false; reason: string };

export function verifyRequestSignature(
  publicKeyPem: string,
  input: RequestSigningInput & { signature: string },
  options: { now?: Date; maxSkewMs?: number } = {},
): SignatureCheck {
  const now = options.now ?? new Date();
  const maxSkew = options.maxSkewMs ?? 5 * 60_000;
  if (!input.timestamp || !input.nonce) return { valid: false, reason: 'Signed timestamp and nonce are required.' };
  const timestamp = Date.parse(input.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(now.getTime() - timestamp) > maxSkew) {
    return { valid: false, reason: 'Request timestamp is outside the allowed window.' };
  }
  if (input.nonce.length < 16) return { valid: false, reason: 'Request nonce is too short.' };
  try {
    const valid = cryptoVerify(
      null,
      Buffer.from(requestSignaturePayload(input)),
      createPublicKey(publicKeyPem),
      Buffer.from(input.signature, 'base64'),
    );
    return valid ? { valid: true } : { valid: false, reason: 'Request signature is invalid.' };
  } catch {
    return { valid: false, reason: 'Request signature could not be checked.' };
  }
}

export interface TaskEnvelopeInput {
  protocolVersion: 1;
  taskId: string;
  deviceId: string;
  runId: string | null;
  type: 'DISCOVER' | 'CAPTURE' | 'PREPARE' | 'VERIFY' | 'SUBMIT';
  mode: 'RESEARCH' | 'DRAFT' | 'ASSISTED' | 'APPROVED_AUTO_SUBMIT';
  source: string;
  targetUrl: string;
  allowedDomains: string[];
  limits: { maxPages: number; maxActions: number; maxDurationMs: number; maxConcurrentPages: number };
  policyVersion: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  payload: Record<string, unknown>;
  documents: Array<{ id: string; kind: 'RESUME' | 'COVER_LETTER' | 'EMAIL' | 'ANSWER'; name: string; version: number; sha256?: string; url?: string }>;
}

export type TaskEnvelope = TaskEnvelopeInput & { signature: string };

export function signTaskEnvelope(input: TaskEnvelopeInput, privateKeyPem: string): TaskEnvelope {
  const signature = cryptoSign(
    null,
    Buffer.from(canonicalJson(input)),
    createPrivateKey(privateKeyPem),
  ).toString('base64');
  return { ...input, signature };
}

export function verifyTaskEnvelope(
  envelope: TaskEnvelope,
  publicKeyPem: string,
  options: { deviceId?: string; now?: Date } = {},
): SignatureCheck {
  const now = options.now ?? new Date();
  if (envelope.protocolVersion !== 1) return { valid: false, reason: 'Unsupported protocol version.' };
  if (options.deviceId && envelope.deviceId !== options.deviceId) return { valid: false, reason: 'Envelope is for another device.' };
  const expires = Date.parse(envelope.expiresAt);
  if (!Number.isFinite(expires)) return { valid: false, reason: 'Envelope expiry is invalid.' };
  if (expires <= now.getTime()) return { valid: false, reason: 'Envelope has expired.' };
  const issued = Date.parse(envelope.issuedAt);
  if (!Number.isFinite(issued)) return { valid: false, reason: 'Envelope issue time is invalid.' };
  if (issued > now.getTime() + 60_000) return { valid: false, reason: 'Envelope issue time is in the future.' };
  const { signature, ...unsigned } = envelope;
  try {
    const valid = cryptoVerify(
      null,
      Buffer.from(canonicalJson(unsigned)),
      createPublicKey(publicKeyPem),
      Buffer.from(signature, 'base64'),
    );
    return valid ? { valid: true } : { valid: false, reason: 'Envelope signature is invalid.' };
  } catch {
    return { valid: false, reason: 'Envelope signature could not be checked.' };
  }
}

function encryptionKey(): Buffer {
  const material = process.env.WORKER_KEY_ENCRYPTION_SECRET || process.env.TOTP_ENCRYPTION_KEY || '';
  if (!material) throw new Error('WORKER_KEY_ENCRYPTION_SECRET or TOTP_ENCRYPTION_KEY is required to protect the worker signing key.');
  return createHash('sha256').update(material).digest();
}

export function encryptPrivateKey(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptPrivateKey(value: string): string {
  const [version, iv, tag, data] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Worker signing key is not in the expected format.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

/** Bounded in-memory replay cache. Per-instance; persistent replay prevention is not required for signed requests. */
export class NonceCache {
  private readonly entries = new Map<string, number>();

  constructor(private readonly ttlMs = 5 * 60_000, private readonly maxEntries = 20_000) {}

  remember(deviceId: string, nonce: string, now = Date.now()): boolean {
    this.sweep(now);
    const key = `${deviceId}:${nonce}`;
    if (this.entries.has(key)) return false;
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest) this.entries.delete(oldest);
    }
    this.entries.set(key, now + this.ttlMs);
    return true;
  }

  clear(): void {
    this.entries.clear();
  }

  private sweep(now: number): void {
    for (const [key, expiry] of this.entries) {
      if (expiry <= now) this.entries.delete(key);
      else break;
    }
  }
}
