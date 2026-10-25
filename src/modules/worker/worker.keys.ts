import { prisma } from '../../lib/prisma';
import { decryptPrivateKey, encryptPrivateKey, generateSigningKeyPair } from './worker.crypto';

const SIGNING_KEY = 'worker_server_signing_key_v1';
const PUBLIC_KEY = 'worker_server_public_key_v1';

export interface ServerSigningKey {
  publicKey: string;
  privateKey: string;
}

let cached: ServerSigningKey | null = null;

export async function getServerSigningKey(): Promise<ServerSigningKey> {
  if (cached) return cached;

  const existing = await prisma.platformConfig.findUnique({ where: { key: SIGNING_KEY } });
  if (existing) {
    const publicRow = await prisma.platformConfig.findUnique({ where: { key: PUBLIC_KEY } });
    if (!publicRow) throw new Error('Worker signing public key is missing.');
    cached = { publicKey: publicRow.value, privateKey: decryptPrivateKey(existing.value) };
    return cached;
  }

  const generated = generateSigningKeyPair();
  // createMany + skipDuplicates makes first-use generation safe when two API
  // instances race at deployment. Both instances then read the same stored key.
  await prisma.platformConfig.createMany({
    data: [
      {
        key: SIGNING_KEY,
        value: encryptPrivateKey(generated.privateKey),
        description: 'Ed25519 private key used to sign local browser worker task envelopes. Never returned by an API.',
        updatedBy: 'system',
      },
      {
        key: PUBLIC_KEY,
        value: generated.publicKey,
        description: 'Ed25519 public key pinned by paired local browser workers.',
        updatedBy: 'system',
      },
    ],
    skipDuplicates: true,
  });

  const [privateRow, publicRow] = await Promise.all([
    prisma.platformConfig.findUnique({ where: { key: SIGNING_KEY } }),
    prisma.platformConfig.findUnique({ where: { key: PUBLIC_KEY } }),
  ]);
  if (!privateRow || !publicRow) throw new Error('Worker signing key could not be initialized.');
  cached = { privateKey: decryptPrivateKey(privateRow.value), publicKey: publicRow.value };
  return cached;
}

export function clearSigningKeyCache(): void {
  cached = null;
}
