import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
function key() {
  const value = process.env.CAREER_TOKEN_KEY ?? '';
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('CAREER_TOKEN_KEY must contain 32 random bytes encoded as hex.');
  return Buffer.from(value, 'hex');
}
export function encryptToken(value: string) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join('.');
}
export function decryptToken(value: string) {
  const [iv, tag, data] = value.split('.');
  if (!iv || !tag || !data) throw new Error('Invalid encrypted token');
  const cipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'hex'));
  cipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([cipher.update(Buffer.from(data, 'hex')), cipher.final()]).toString('utf8');
}
