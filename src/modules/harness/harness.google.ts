import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';
import { decryptToken, encryptToken } from '../career/career.crypto';
import type { GoogleCapabilityName, HarnessPreferences } from './harness.schema';
import { findTrackerUrl } from './harness.sheet-identity';

const CAPABILITY_SCOPES: Record<GoogleCapabilityName, string[]> = {
  DRIVE_DOCUMENTS: ['https://www.googleapis.com/auth/drive.file'],
  DRIVE_APP_DATA: ['https://www.googleapis.com/auth/drive.appdata'],
  SHEET_TRACKER: ['https://www.googleapis.com/auth/drive.file'],
  GMAIL_DRAFTS: ['https://www.googleapis.com/auth/gmail.compose'],
  GMAIL_SEND: ['https://www.googleapis.com/auth/gmail.send'],
  CALENDAR_EVENTS: ['https://www.googleapis.com/auth/calendar.events.owned'],
};

export function effectiveGoogleCapabilities(connection: { grantedScopes: string[]; capabilities: Array<{ capability: string; enabled: boolean }> }) {
  return connection.capabilities.map(row => ({
    ...row,
    enabled: row.enabled && CAPABILITY_SCOPES[row.capability as GoogleCapabilityName]?.every(scope => connection.grantedScopes.includes(scope)) === true,
  }));
}

const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
  scope: z.string().optional(),
  id_token: z.string().optional(),
});

const userInfoSchema = z.object({ sub: z.string(), email: z.email() });

function googleConfig() {
  const clientId = process.env.HARNESS_GOOGLE_CLIENT_ID ?? process.env.CAREER_GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.HARNESS_GOOGLE_CLIENT_SECRET ?? process.env.CAREER_GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.HARNESS_GOOGLE_REDIRECT_URI
    ?? process.env.CAREER_GOOGLE_REDIRECT_URI?.replace('/career/', '/harness/')
    ?? 'http://localhost:5000/api/v1/harness/google/callback';
  if (!clientId || !clientSecret || !redirectUri || !process.env.CAREER_TOKEN_KEY) {
    throw new AppError(503, 'Google harness integration is not configured.');
  }
  return { clientId, clientSecret, redirectUri };
}

function allowedPopupOrigin(origin: string) {
  const allowed = new Set([
    process.env.FRONTEND_URL ? new URL(process.env.FRONTEND_URL).origin : '',
    'http://localhost:3000',
  ]);
  if (!allowed.has(new URL(origin).origin)) throw new AppError(400, 'Popup origin is not allowed.');
  return new URL(origin).origin;
}

export function googleHarnessConfigured() {
  try { googleConfig(); return true; } catch { return false; }
}

export async function beginGoogleConnection(userId: string, capabilities: GoogleCapabilityName[], popupOrigin: string) {
  const cfg = googleConfig();
  const origin = allowedPopupOrigin(popupOrigin);
  const state = randomBytes(32).toString('hex');
  const verifier = randomBytes(48).toString('base64url');
  const id = createHash('sha256').update(state).digest('hex');
  await prisma.$transaction(async tx => {
    await tx.harnessOAuthState.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { userId }] } });
    await tx.harnessOAuthState.create({ data: { id, userId, verifier: encryptToken(verifier), capabilities, popupOrigin: origin, expiresAt: new Date(Date.now() + 600_000) } });
  });
  const scopes = [...new Set(['openid', 'email', ...capabilities.flatMap(capability => CAPABILITY_SCOPES[capability])])];
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, expiresInSeconds: 600 };
}

export async function finishGoogleConnection(code: string, state: string) {
  const id = createHash('sha256').update(state).digest('hex');
  const oauthState = await prisma.$transaction(async tx => {
    const row = await tx.harnessOAuthState.findUnique({ where: { id } });
    if (!row || row.expiresAt < new Date()) throw new AppError(400, 'OAuth request expired. Connect again.');
    const deleted = await tx.harnessOAuthState.deleteMany({ where: { id } });
    if (!deleted.count) throw new AppError(400, 'OAuth request was already used.');
    return row;
  });
  const cfg = googleConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      code,
      code_verifier: decryptToken(oauthState.verifier),
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new AppError(502, 'Google authorization failed. Connect again.');
  const next = tokenSchema.parse(await response.json());
  const userInfoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${next.access_token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!userInfoResponse.ok) throw new AppError(502, 'Google account identity could not be verified.');
  const userInfo = userInfoSchema.parse(await userInfoResponse.json());
  const grantedScopes = next.scope?.split(' ').filter(Boolean) ?? [];
  const existing = await prisma.googleAccountConnection.findUnique({ where: { userId: oauthState.userId } });
  const prior = existing ? JSON.parse(decryptToken(existing.encryptedTokens)) as { refresh_token?: string } : {};
  const storedTokens = { ...next, refresh_token: next.refresh_token ?? prior.refresh_token };
  if (!storedTokens.refresh_token) throw new AppError(400, 'Offline access was not granted. Reconnect with consent.');

  const connection = await prisma.$transaction(async tx => {
    const saved = await tx.googleAccountConnection.upsert({
      where: { userId: oauthState.userId },
      create: {
        userId: oauthState.userId,
        googleSubjectId: userInfo.sub,
        googleEmail: userInfo.email,
        encryptedTokens: encryptToken(JSON.stringify(storedTokens)),
        grantedScopes,
        accessTokenExpiresAt: new Date(Date.now() + next.expires_in * 1000),
      },
      update: {
        googleSubjectId: userInfo.sub,
        googleEmail: userInfo.email,
        encryptedTokens: encryptToken(JSON.stringify(storedTokens)),
        grantedScopes,
        accessTokenExpiresAt: new Date(Date.now() + next.expires_in * 1000),
        status: 'CONNECTED',
        revokedAt: null,
      },
    });
    for (const capability of oauthState.capabilities) {
      const needed = CAPABILITY_SCOPES[capability as GoogleCapabilityName];
      const enabled = needed.every(scope => grantedScopes.includes(scope));
      await tx.googleCapability.upsert({
        where: { connectionId_capability: { connectionId: saved.id, capability } },
        create: { connectionId: saved.id, capability, enabled },
        update: { enabled, grantedAt: new Date() },
      });
    }
    await tx.harnessAuditEvent.create({ data: { userId: oauthState.userId, action: 'GOOGLE_CONNECTED', entityType: 'GoogleAccountConnection', entityId: saved.id, outcome: 'SUCCESS', metadata: { email: userInfo.email, capabilities: oauthState.capabilities } } });
    return saved;
  });
  return { popupOrigin: oauthState.popupOrigin, email: connection.googleEmail, capabilities: oauthState.capabilities };
}

async function googleAccessToken(userId: string, capability: GoogleCapabilityName) {
  const connection = await prisma.googleAccountConnection.findUnique({ where: { userId }, include: { capabilities: true } });
  if (!connection || connection.status !== 'CONNECTED') throw new AppError(400, 'Connect Google first.');
  if (!effectiveGoogleCapabilities(connection).some(row => row.capability === capability && row.enabled)) throw new AppError(403, `${capability} permission is not connected. Reconnect it to grant the current scopes.`);
  let tokens = JSON.parse(decryptToken(connection.encryptedTokens)) as { access_token: string; refresh_token: string };
  if (connection.accessTokenExpiresAt.getTime() < Date.now() + 60_000) {
    const cfg = googleConfig();
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'refresh_token', refresh_token: tokens.refresh_token }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      await prisma.googleAccountConnection.update({ where: { id: connection.id }, data: { status: 'RECONNECT_REQUIRED' } });
      throw new AppError(401, 'Google connection needs to be renewed.');
    }
    const refreshed = tokenSchema.parse(await response.json());
    tokens = { access_token: refreshed.access_token, refresh_token: refreshed.refresh_token ?? tokens.refresh_token };
    await prisma.googleAccountConnection.update({ where: { id: connection.id }, data: { encryptedTokens: encryptToken(JSON.stringify(tokens)), accessTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000), lastSuccessfulUseAt: new Date() } });
  }
  await prisma.googleCapability.updateMany({ where: { connectionId: connection.id, capability }, data: { lastUsedAt: new Date() } });
  return tokens.access_token;
}

async function googleJson<T>(url: string, token: string, init: RequestInit) {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    const detail = body?.error?.message?.replace(/\s+/g, ' ').trim().slice(0, 240);
    throw new AppError(response.status === 429 ? 429 : 502, `Google API request failed with status ${response.status}${detail ? `: ${detail}` : ''}.`);
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

export async function disconnectHarnessGoogle(userId: string) {
  const connection = await prisma.googleAccountConnection.findUnique({ where: { userId } });
  if (!connection) return { disconnected: true };
  const tokens = JSON.parse(decryptToken(connection.encryptedTokens)) as { refresh_token?: string; access_token?: string };
  const token = tokens.refresh_token ?? tokens.access_token;
  if (token) {
    const response = await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', body: new URLSearchParams({ token }), signal: AbortSignal.timeout(10_000) });
    if (!response.ok && response.status !== 400) throw new AppError(502, 'Google revocation failed. Retry disconnecting.');
  }
  await prisma.$transaction([
    prisma.googleAccountConnection.delete({ where: { id: connection.id } }),
    prisma.harnessAuditEvent.create({ data: { userId, action: 'GOOGLE_DISCONNECTED', entityType: 'GoogleAccountConnection', entityId: connection.id, outcome: 'SUCCESS' } }),
  ]);
  return { disconnected: true };
}

const TRACKER_HEADERS = ['Company', 'Role', 'Match score', 'Location', 'Salary', 'Job URL', 'Source', 'Found date', 'Deadline', 'Resume', 'Gmail draft', 'Status', 'Applied date', 'Follow-up date', 'Blocker', 'Notes', 'ProfileAI job ID'];

export async function createGoogleTracker(userId: string, name: string) {
  const token = await googleAccessToken(userId, 'SHEET_TRACKER');
  const file = await googleJson<{ spreadsheetId: string; spreadsheetUrl?: string }>('https://sheets.googleapis.com/v4/spreadsheets', token, {
    method: 'POST',
    body: JSON.stringify({ properties: { title: name }, sheets: [{ properties: { title: 'Sheet1' }, data: [{ startRow: 0, startColumn: 0, rowData: [{ values: TRACKER_HEADERS.map(value => ({ userEnteredValue: { stringValue: value } })) }] }] }] }),
  });
  const externalUrl = file.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${file.spreadsheetId}/edit`;
  const sync = await prisma.harnessExternalSync.upsert({
    where: { userId_kind_syncKey: { userId, kind: 'SHEET_TRACKER', syncKey: 'primary' } },
    create: { userId, kind: 'SHEET_TRACKER', syncKey: 'primary', externalId: file.spreadsheetId, externalUrl, metadata: { headers: TRACKER_HEADERS } },
    update: { externalId: file.spreadsheetId, externalUrl, state: 'SYNCED', lastSyncedAt: new Date(), metadata: { headers: TRACKER_HEADERS } },
  });
  return sync;
}

export async function appendJobToTracker(userId: string, jobId: string, score: number, blocker = '') {
  const tracker = await prisma.harnessExternalSync.findUnique({ where: { userId_kind_syncKey: { userId, kind: 'SHEET_TRACKER', syncKey: 'primary' } } });
  if (!tracker) throw new AppError(400, 'Create or connect a Google Sheet tracker first.');
  const existing = await prisma.harnessExternalSync.findUnique({ where: { userId_kind_syncKey: { userId, kind: 'SHEET_ROW', syncKey: jobId } } });
  if (existing) return existing;
  const job = await prisma.job.findFirst({ where: { id: jobId, userId } });
  if (!job) throw new AppError(404, 'Job not found.');
  const token = await googleAccessToken(userId, 'SHEET_TRACKER');
  if (job.canonicalUrl) {
    const existingRows = await googleJson<{ values?: unknown[][] }>(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(tracker.externalId)}/values/Sheet1!F:F`, token, { method: 'GET' });
    const row = findTrackerUrl(existingRows.values, job.canonicalUrl);
    if (row !== null) return prisma.harnessExternalSync.create({ data: { userId, jobId, kind: 'SHEET_ROW', syncKey: jobId, externalId: tracker.externalId, externalUrl: tracker.externalUrl, metadata: { existingRow: row } } });
  }
  const salary = job.salaryMin ? `${job.salaryCurrency ?? ''} ${job.salaryMin}`.trim() : '';
  const values = [[job.company, job.title, score, job.location ?? '', salary, job.canonicalUrl ?? '', job.sourceName, new Date().toISOString().slice(0, 10), job.expiresAt?.toISOString().slice(0, 10) ?? '', '', '', 'Saved', '', '', blocker, '', job.id]];
  const result = await googleJson<{ updates?: { updatedRange?: string } }>(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(tracker.externalId)}/values/Sheet1!A:Q:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, token, { method: 'POST', body: JSON.stringify({ values }) });
  return prisma.harnessExternalSync.create({ data: { userId, jobId, kind: 'SHEET_ROW', syncKey: jobId, externalId: tracker.externalId, externalUrl: tracker.externalUrl, metadata: { updatedRange: result.updates?.updatedRange } } });
}

export async function syncPreferencesToDrive(userId: string, preferences: HarnessPreferences, version: number) {
  const token = await googleAccessToken(userId, 'DRIVE_APP_DATA');
  const payload = JSON.stringify({ schemaVersion: 1, preferenceVersion: version, syncedAt: new Date().toISOString(), preferences }, null, 2);
  const prior = await prisma.harnessExternalSync.findUnique({ where: { userId_kind_syncKey: { userId, kind: 'DRIVE_APP_DATA', syncKey: 'preferences' } } });
  let fileId = prior?.externalId;
  if (fileId) {
    const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: payload, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new AppError(502, 'Google Drive preference sync failed.');
  } else {
    const boundary = `profileai-${randomBytes(12).toString('hex')}`;
    const body = [`--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify({ name: 'profileai-harness.json', parents: ['appDataFolder'], mimeType: 'application/json' }), `--${boundary}`, 'Content-Type: application/json', '', payload, `--${boundary}--`].join('\r\n');
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new AppError(502, 'Google Drive preference sync failed.');
    fileId = z.object({ id: z.string() }).parse(await response.json()).id;
  }
  return prisma.harnessExternalSync.upsert({
    where: { userId_kind_syncKey: { userId, kind: 'DRIVE_APP_DATA', syncKey: 'preferences' } },
    create: { userId, kind: 'DRIVE_APP_DATA', syncKey: 'preferences', externalId: fileId!, metadata: { version } },
    update: { externalId: fileId!, state: 'SYNCED', lastSyncedAt: new Date(), metadata: { version } },
  });
}

export async function createGmailDraft(userId: string, documentId: string, attachment?: { bytes: Buffer; fileName: string }) {
  const existing = await prisma.harnessExternalSync.findUnique({ where: { userId_kind_syncKey: { userId, kind: 'GMAIL_DRAFT', syncKey: documentId } } });
  if (existing) return existing;
  const document = await prisma.careerDocument.findFirst({ where: { id: documentId, userId } });
  if (!document) throw new AppError(404, 'Draft document not found.');
  const token = await googleAccessToken(userId, 'GMAIL_DRAFTS');
  const subject = document.subject.replace(/[\r\n]/g, ' ');
  const commonHeaders = [document.recipient ? `To: ${z.email().parse(document.recipient)}` : '', `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`, 'MIME-Version: 1.0'].filter(Boolean);
  let message: string;
  if (attachment) {
    const boundary = `profileai-mail-${randomBytes(12).toString('hex')}`;
    const fileName = attachment.fileName.replace(/[\r\n"]/g, '_');
    message = [
      ...commonHeaders,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(document.body).toString('base64'),
      `--${boundary}`,
      `Content-Type: application/pdf; name="${fileName}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${fileName}"`,
      '',
      attachment.bytes.toString('base64'),
      `--${boundary}--`,
    ].join('\r\n');
  } else {
    message = [...commonHeaders, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', Buffer.from(document.body).toString('base64')].join('\r\n');
  }
  const raw = Buffer.from(message).toString('base64url');
  const draft = await googleJson<{ id: string }>('https://gmail.googleapis.com/gmail/v1/users/me/drafts', token, { method: 'POST', body: JSON.stringify({ message: { raw } }) });
  return prisma.harnessExternalSync.create({ data: { userId, jobId: document.jobId, kind: 'GMAIL_DRAFT', syncKey: documentId, externalId: draft.id, externalUrl: 'https://mail.google.com/mail/u/0/#drafts', metadata: { documentId } } });
}

async function multipartDriveUpload(token: string, metadata: Record<string, unknown>, content: string | Buffer, contentType: string) {
  const boundary = `profileai-${randomBytes(12).toString('hex')}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
    Buffer.isBuffer(content) ? content : Buffer.from(content),
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new AppError(502, 'Google Drive document upload failed.');
  return z.object({ id: z.string(), name: z.string(), webViewLink: z.string().optional(), webContentLink: z.string().optional() }).parse(await response.json());
}

async function ensureDriveFolder(userId: string, token: string, name: string, syncKey: string, parentId?: string) {
  const prior = await prisma.harnessExternalSync.findUnique({ where: { userId_kind_syncKey: { userId, kind: 'DRIVE_FOLDER', syncKey } } });
  if (prior) return prior;
  const folder = await googleJson<{ id: string; webViewLink?: string }>('https://www.googleapis.com/drive/v3/files?fields=id,webViewLink', token, {
    method: 'POST',
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', ...(parentId ? { parents: [parentId] } : {}) }),
  });
  return prisma.harnessExternalSync.create({ data: { userId, kind: 'DRIVE_FOLDER', syncKey, externalId: folder.id, ...(folder.webViewLink ? { externalUrl: folder.webViewLink } : {}) } });
}

export async function uploadCareerDocumentToDrive(userId: string, documentId: string) {
  const prior = await prisma.harnessExternalSync.findUnique({ where: { userId_kind_syncKey: { userId, kind: 'DRIVE_DOCUMENT', syncKey: documentId } } });
  if (prior) return prior;
  const document = await prisma.careerDocument.findFirst({ where: { id: documentId, userId } });
  if (!document) throw new AppError(404, 'Career document not found.');
  const token = await googleAccessToken(userId, 'DRIVE_DOCUMENTS');
  const root = await ensureDriveFolder(userId, token, 'ProfileAI', 'root');
  const applications = await ensureDriveFolder(userId, token, 'Applications', 'applications', root.externalId);
  const safeName = document.title.replace(/[\\/:*?"<>|]/g, '-').slice(0, 120);
  const file = await multipartDriveUpload(token, { name: safeName, parents: [applications.externalId], mimeType: 'application/vnd.google-apps.document' }, `${document.subject}\n\n${document.body}`, 'text/plain; charset=UTF-8');
  const externalUrl = file.webViewLink ?? `https://drive.google.com/open?id=${file.id}`;
  const sync = await prisma.harnessExternalSync.create({ data: { userId, jobId: document.jobId, kind: 'DRIVE_DOCUMENT', syncKey: documentId, externalId: file.id, externalUrl, metadata: { documentId, kind: document.kind } } });
  await prisma.harnessArtifact.updateMany({ where: { userId, jobId: document.jobId, kind: { in: ['APPLICATION_EMAIL', 'COVER_LETTER'] } }, data: { providerId: file.id, providerUrl: externalUrl, state: 'SYNCED_TO_DRIVE' } });
  return sync;
}

export async function uploadResumeBufferToDrive(userId: string, resumeId: string, bytes: Buffer) {
  const prior = await prisma.harnessExternalSync.findUnique({ where: { userId_kind_syncKey: { userId, kind: 'DRIVE_RESUME', syncKey: resumeId } } });
  if (prior) return prior;
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume) throw new AppError(404, 'Resume not found.');
  if (bytes.length > 10 * 1024 * 1024 || !bytes.subarray(0, 4).equals(Buffer.from('%PDF'))) throw new AppError(400, 'Resume export is not a valid PDF under 10 MB.');
  const token = await googleAccessToken(userId, 'DRIVE_DOCUMENTS');
  const root = await ensureDriveFolder(userId, token, 'ProfileAI', 'root');
  const resumes = await ensureDriveFolder(userId, token, 'Resumes', 'resumes', root.externalId);
  const safeName = `${resume.title.replace(/[\\/:*?"<>|]/g, '-').slice(0, 110)}.pdf`;
  const file = await multipartDriveUpload(token, { name: safeName, parents: [resumes.externalId] }, bytes, 'application/pdf');
  const externalUrl = file.webViewLink ?? file.webContentLink ?? `https://drive.google.com/open?id=${file.id}`;
  return prisma.harnessExternalSync.create({ data: { userId, kind: 'DRIVE_RESUME', syncKey: resumeId, externalId: file.id, externalUrl, metadata: { resumeId, version: resume.version } } });
}

export async function uploadResumePdfToDrive(userId: string, resumeId: string) {
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume?.pdfUrl) throw new AppError(400, 'Export the resume PDF before Drive sync.');
  const sourceUrl = /^https?:\/\//.test(resume.pdfUrl) ? resume.pdfUrl : null;
  if (!sourceUrl) throw new AppError(400, 'Resume PDF needs a fresh export before Drive sync.');
  const source = await fetch(sourceUrl, { signal: AbortSignal.timeout(20_000) });
  if (!source.ok) throw new AppError(502, 'Resume PDF could not be fetched for Drive sync.');
  return uploadResumeBufferToDrive(userId, resumeId, Buffer.from(await source.arrayBuffer()));
}
