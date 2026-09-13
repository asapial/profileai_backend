import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';
import { decryptToken, encryptToken } from './career.crypto';
import { ownerLock } from './career.service';

const scopes = { mail: 'https://www.googleapis.com/auth/gmail.send', calendar: 'https://www.googleapis.com/auth/calendar.events.owned' };
const tokenSchema = z.object({ access_token: z.string(), refresh_token: z.string().optional(), expires_in: z.number(), scope: z.string().optional() });
function config() {
  const client_id = process.env.CAREER_GOOGLE_CLIENT_ID;
  const client_secret = process.env.CAREER_GOOGLE_CLIENT_SECRET;
  const redirect_uri = process.env.CAREER_GOOGLE_REDIRECT_URI;
  if (!client_id || !client_secret || !redirect_uri || !process.env.CAREER_TOKEN_KEY) throw new AppError(503, 'Google integration is not configured by the administrator.');
  return { client_id, client_secret, redirect_uri };
}
export async function connectGoogle(userId: string, purpose: 'mail' | 'calendar') {
  const cfg = config();
  const state = randomBytes(32).toString('hex'); const verifier = randomBytes(48).toString('base64url');
  await prisma.careerOAuthState.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { userId, purpose }] } });
  await prisma.careerOAuthState.create({ data: { id: createHash('sha256').update(state).digest('hex'), userId, purpose, verifier: encryptToken(verifier), expiresAt: new Date(Date.now() + 600000) } });
  const params = new URLSearchParams({ client_id: cfg.client_id, redirect_uri: cfg.redirect_uri, response_type: 'code', scope: scopes[purpose], access_type: 'offline', prompt: 'consent', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
}
export async function oauthCallback(code: string, state: string) {
  const id = createHash('sha256').update(state).digest('hex');
  const record = await prisma.$transaction(async tx => {
    const row = await tx.careerOAuthState.findUnique({ where: { id } });
    if (!row || row.expiresAt < new Date()) throw new AppError(400, 'OAuth request expired. Connect again.');
    const removed = await tx.careerOAuthState.deleteMany({ where: { id } });
    if (!removed.count) throw new AppError(400, 'OAuth request already used.');
    return row;
  });
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ ...config(), code, code_verifier: decryptToken(record.verifier), grant_type: 'authorization_code' }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new AppError(502, 'Google authorization failed. Connect again.');
  const tokens = tokenSchema.parse(await response.json());
  const scope = scopes[record.purpose as keyof typeof scopes];
  if (!tokens.scope?.split(' ').includes(scope)) throw new AppError(400, 'Required permission was not granted.');
  const provider = `google-${record.purpose}`;
  const existing = await prisma.careerConnection.findUnique({ where: { userId_provider: { userId: record.userId, provider } } });
  const previous = existing ? JSON.parse(decryptToken(existing.tokens)) as { refresh_token?: string } : {};
  const saved = { ...tokens, refresh_token: tokens.refresh_token ?? previous.refresh_token };
  if (!saved.refresh_token) throw new AppError(400, 'Offline access was not granted. Reconnect with consent.');
  const data = { tokens: encryptToken(JSON.stringify(saved)), scopes: scope, expiresAt: new Date(Date.now() + tokens.expires_in * 1000) };
  await prisma.careerConnection.upsert({ where: { userId_provider: { userId: record.userId, provider } }, create: { userId: record.userId, provider, ...data }, update: data });
  return { connected: provider };
}
async function accessToken(userId: string, purpose: string) {
  const row = await prisma.careerConnection.findUnique({ where: { userId_provider: { userId, provider: `google-${purpose}` } } });
  if (!row) throw new AppError(400, 'Connect Google first.');
  let tokens = JSON.parse(decryptToken(row.tokens)) as { access_token: string; refresh_token: string };
  if (row.expiresAt.getTime() < Date.now() + 60000) {
    const cfg = config();
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: cfg.client_id, client_secret: cfg.client_secret, grant_type: 'refresh_token', refresh_token: tokens.refresh_token }), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new AppError(400, 'Google connection needs to be renewed.');
    const next = tokenSchema.parse(await response.json()); tokens = { access_token: next.access_token, refresh_token: next.refresh_token ?? tokens.refresh_token };
    await prisma.careerConnection.update({ where: { id: row.id }, data: { tokens: encryptToken(JSON.stringify(tokens)), expiresAt: new Date(Date.now() + next.expires_in * 1000) } });
  }
  return tokens.access_token;
}
export async function disconnectGoogle(userId: string, purpose: string) {
  const provider = `google-${purpose}`;
  const row = await prisma.careerConnection.findUnique({ where: { userId_provider: { userId, provider } } });
  if (row) {
    const tokens = JSON.parse(decryptToken(row.tokens)) as { refresh_token: string };
    const response = await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', body: new URLSearchParams({ token: tokens.refresh_token }), signal: AbortSignal.timeout(10000) });
    if (!response.ok && response.status !== 400) throw new AppError(502, 'Revocation failed. Please retry disconnecting.');
    // Google may revoke the whole client grant, so remove both local connections.
    await prisma.careerConnection.deleteMany({ where: { userId, provider: { startsWith: 'google-' } } });
    await prisma.careerDelivery.updateMany({ where: { userId, state: 'QUEUED' }, data: { state: 'CANCELLED', payload: {} } });
  }
  return { disconnected: true };
}
export const calendarBody = z.object({ key: z.string().uuid(), summary: z.string().min(2).max(160), start: z.iso.datetime(), end: z.iso.datetime(), reviewed: z.literal(true) }).refine(v => Date.parse(v.end) > Date.parse(v.start), 'End must follow start.');
export async function queueMail(userId: string, draftId: string, key: string) {
  return prisma.$transaction(async tx => {
    await ownerLock(tx, userId);
    const old = await tx.careerDelivery.findUnique({ where: { userId_key: { userId, key } } });
    if (old) return old;
    const draft = await tx.careerDocument.findFirst({ where: { id: draftId, userId } });
    if (draft?.kind === 'INTERVIEW_STORY') throw new AppError(400, 'Interview stories are private preparation documents, not emails.');
    if (!draft?.reviewedAt || !draft.recipient) throw new AppError(400, 'Review and save a recipient before sending.');
    const already = await tx.careerDelivery.findFirst({ where: { userId, kind: 'mail', payload: { path: ['draftId'], equals: draftId }, state: { in: ['QUEUED', 'SENDING', 'SENT', 'UNKNOWN'] } } });
    if (already) return already;
    if (!await tx.careerConnection.findUnique({ where: { userId_provider: { userId, provider: 'google-mail' } } })) throw new AppError(400, 'Connect Gmail first.');
    const count = await tx.careerDelivery.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 86400000) } } });
    if (count >= 20) throw new AppError(429, 'Daily delivery limit reached.');
    return tx.careerDelivery.create({ data: { userId, key, kind: 'mail', payload: { draftId, recipient: draft.recipient, subject: draft.subject, body: draft.body } } });
  });
}
export async function queueCalendar(userId: string, input: z.infer<typeof calendarBody>) {
  if (!await prisma.careerConnection.findUnique({ where: { userId_provider: { userId, provider: 'google-calendar' } } })) throw new AppError(400, 'Connect Google Calendar first.');
  return prisma.$transaction(async tx => {
    await ownerLock(tx, userId);
    const existing = await tx.careerDelivery.findUnique({ where: { userId_key: { userId, key: input.key } } });
    if (existing) return existing;
    const count = await tx.careerDelivery.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 86400000) } } });
    if (count >= 20) throw new AppError(429, 'Daily delivery limit reached.');
    return tx.careerDelivery.create({ data: { userId, key: input.key, kind: 'calendar', payload: input } });
  });
}

// A durable outbox. Ambiguous sends are never automatically retried: Gmail has no idempotency key.
export async function processDeliveries() {
  await prisma.careerDelivery.updateMany({ where: { state: 'SENDING', updatedAt: { lt: new Date(Date.now() - 120000) } }, data: { state: 'UNKNOWN', error: 'Delivery interrupted. Check the provider before retrying.' } });
  const rows = await prisma.careerDelivery.findMany({ where: { state: 'QUEUED', nextAttemptAt: { lte: new Date() } }, orderBy: { createdAt: 'asc' }, take: 10 });
  for (const row of rows) {
    const claimed = await prisma.careerDelivery.updateMany({ where: { id: row.id, state: 'QUEUED' }, data: { state: 'SENDING', attempts: { increment: 1 } } });
    if (!claimed.count) continue;
    let started = false;
    try {
      const token = await accessToken(row.userId, row.kind);
      const p = row.payload as Record<string, string>;
      const raw = row.kind === 'mail' ? Buffer.from([`To: ${z.email().parse(p.recipient)}`, `Subject: =?UTF-8?B?${Buffer.from(p.subject!).toString('base64')}?=`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', Buffer.from(p.body!).toString('base64')].join('\r\n')).toString('base64url') : '';
      const eventId = createHash('sha256').update(row.id).digest('hex');
      started = true;
      const response = await fetch(row.kind === 'mail' ? 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send' : 'https://www.googleapis.com/calendar/v3/calendars/primary/events', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(row.kind === 'mail' ? { raw } : { id: eventId, summary: p.summary, start: { dateTime: p.start }, end: { dateTime: p.end } }), signal: AbortSignal.timeout(15000) });
      if (response.status === 429 && row.attempts < 4) {
        await prisma.careerDelivery.update({ where: { id: row.id }, data: { state: 'QUEUED', nextAttemptAt: new Date(Date.now() + 60000 * 2 ** row.attempts), error: 'Provider rate limit; retry scheduled.' } }); continue;
      }
      if (!response.ok && !(row.kind === 'calendar' && response.status === 409)) {
        await prisma.careerDelivery.update({ where: { id: row.id }, data: { state: response.status >= 500 ? 'UNKNOWN' : 'FAILED', error: 'Provider did not confirm delivery. Review before resending.' } }); continue;
      }
      const result = response.status === 409 ? { id: eventId } : z.object({ id: z.string() }).parse(await response.json());
      await prisma.careerDelivery.update({ where: { id: row.id }, data: { state: 'SENT', providerId: result.id, error: null } });
    } catch {
      await prisma.careerDelivery.update({ where: { id: row.id }, data: { state: started ? 'UNKNOWN' : 'FAILED', error: started ? 'Outcome uncertain. Check Google before sending again.' : 'Connection unavailable. Reconnect and retry.' } });
    }
  }
}
