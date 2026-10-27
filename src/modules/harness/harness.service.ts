import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';
import { ownerLock } from '../career/career.service';
import { normalizeRoleLabel } from './harness.jobs';
import { DEFAULT_HARNESS_PREFERENCES, harnessPreferenceSchema, type HarnessPreferences } from './harness.schema';
import { effectiveGoogleCapabilities, googleHarnessConfigured } from './harness.google';
import { companyNeedsVerification } from './harness.policy';

const STEP_KEYS = ['DISCOVER', 'VERIFY', 'MATCH', 'PREPARE_DOCUMENTS', 'GOOGLE_SYNC', 'BROWSER_PREPARE'] as const;

type SheetRow = {
  jobId: string;
  title: string;
  company: string;
  location: string | null;
  canonicalUrl: string | null;
  sourceName: string;
  lifecycle: string;
  score: number;
  decision: string;
  reasons: unknown;
  missing: unknown;
  status: 'MATCHED' | 'CV_READY' | 'READY_FOR_REVIEW' | 'BROWSER_QUEUED' | 'APPLIED';
  resumeId: string | null;
  documentId: string | null;
  subject: string | null;
  body: string | null;
  atsScore: number | null;
  decidedAt: string;
};

// The job sheet is the harness workspace record the user actually reads: every
// unique job it discovered, its explainable score, and whether a tailored CV,
// email draft, browser handoff or application exists yet.
async function buildSheet(userId: string) {
  const decisions = await prisma.harnessCandidateDecision.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 300 });
  const latest = new Map<string, typeof decisions[number]>();
  for (const decision of decisions) if (!latest.has(decision.jobId)) latest.set(decision.jobId, decision);
  const jobIds = [...latest.keys()];
  if (!jobIds.length) return { rows: [] as SheetRow[], stats: { total: 0, eligible: 0, reviewRequired: 0, cvs: 0, drafts: 0, queued: 0, applied: 0 } };
  const [jobs, artifacts, documents, applications, tasks] = await Promise.all([
    prisma.job.findMany({ where: { userId, id: { in: jobIds } }, select: { id: true, title: true, company: true, location: true, canonicalUrl: true, sourceName: true, lifecycle: true } }),
    prisma.harnessArtifact.findMany({ where: { userId, jobId: { in: jobIds }, kind: 'TAILORED_RESUME' }, orderBy: { updatedAt: 'desc' } }),
    prisma.careerDocument.findMany({ where: { userId, jobId: { in: jobIds }, kind: 'APPLICATION' }, orderBy: { updatedAt: 'desc' } }),
    prisma.jobApplication.findMany({ where: { userId, jobId: { in: jobIds } }, select: { jobId: true, status: true } }),
    prisma.browserTask.findMany({ where: { userId, jobId: { in: jobIds }, state: { in: ['QUEUED', 'CLAIMED', 'OPENED', 'FILLED', 'WAITING_FOR_USER', 'BLOCKED'] } }, select: { jobId: true } }),
  ]);
  const rows: SheetRow[] = [];
  for (const [jobId, decision] of latest) {
    const job = jobs.find(row => row.id === jobId);
    if (!job) continue;
    const artifact = artifacts.find(row => row.jobId === jobId);
    const document = documents.find(row => row.jobId === jobId);
    const application = applications.find(row => row.jobId === jobId);
    const queued = tasks.some(row => row.jobId === jobId);
    const status: SheetRow['status'] = application ? 'APPLIED' : queued ? 'BROWSER_QUEUED' : document && artifact?.localRef ? 'READY_FOR_REVIEW' : artifact?.localRef ? 'CV_READY' : 'MATCHED';
    const artifactMetadata = (artifact?.metadata ?? {}) as { atsScore?: unknown };
    rows.push({
      jobId,
      title: job.title,
      company: job.company,
      location: job.location,
      canonicalUrl: job.canonicalUrl,
      sourceName: job.sourceName,
      lifecycle: job.lifecycle,
      score: decision.score,
      decision: decision.decision,
      reasons: decision.reasons,
      missing: decision.missing,
      status,
      resumeId: artifact?.localRef ?? null,
      documentId: document?.id ?? null,
      subject: document?.subject ?? null,
      body: document?.body ? document.body.slice(0, 4000) : null,
      atsScore: typeof artifactMetadata.atsScore === 'number' ? artifactMetadata.atsScore : null,
      decidedAt: decision.createdAt.toISOString(),
    });
  }
  rows.sort((left, right) => right.score - left.score || Date.parse(right.decidedAt) - Date.parse(left.decidedAt));
  const stats = {
    total: rows.length,
    eligible: rows.filter(row => row.decision === 'ELIGIBLE').length,
    reviewRequired: rows.filter(row => row.decision === 'REVIEW_REQUIRED').length,
    cvs: rows.filter(row => row.resumeId).length,
    drafts: rows.filter(row => row.documentId).length,
    queued: rows.filter(row => row.status === 'BROWSER_QUEUED').length,
    applied: rows.filter(row => row.status === 'APPLIED').length,
  };
  return { rows, stats };
}

export async function overview(userId: string) {
  const [preference, runs, connection, tracker, companions, reviewTasks, decisions, audits, sheet] = await Promise.all([
    prisma.harnessPreferenceVersion.findFirst({ where: { userId }, orderBy: { version: 'desc' } }),
    prisma.harnessRun.findMany({ where: { userId }, include: { steps: { orderBy: { position: 'asc' } } }, orderBy: { createdAt: 'desc' }, take: 15 }),
    prisma.googleAccountConnection.findUnique({ where: { userId }, include: { capabilities: { orderBy: { capability: 'asc' } } } }),
    prisma.harnessExternalSync.findUnique({ where: { userId_kind_syncKey: { userId, kind: 'SHEET_TRACKER', syncKey: 'primary' } } }),
    prisma.browserCompanion.findMany({ where: { userId, revokedAt: null }, select: { id: true, name: true, status: true, lastSeenAt: true, expiresAt: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
    prisma.browserTask.findMany({ where: { userId, state: { in: ['QUEUED', 'CLAIMED', 'WAITING_FOR_USER', 'BLOCKED'] } }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.harnessCandidateDecision.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { score: 'desc' }], take: 50 }),
    prisma.harnessAuditEvent.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 200 }),
    buildSheet(userId),
  ]);
  const jobIds = [...new Set(decisions.map(row => row.jobId))];
  const jobs = jobIds.length ? await prisma.job.findMany({ where: { userId, id: { in: jobIds } }, select: { id: true, company: true, title: true, location: true, canonicalUrl: true, lifecycle: true } }) : [];
  return {
    configured: { google: googleHarnessConfigured(), companionOrigins: Boolean(process.env.BROWSER_COMPANION_ORIGINS) },
    preference: preference ? { ...preference, preferences: harnessPreferenceSchema.parse(preference.preferences) } : { version: 0, preferences: DEFAULT_HARNESS_PREFERENCES },
    runs,
    google: connection ? { id: connection.id, email: connection.googleEmail, status: connection.status, grantedScopes: connection.grantedScopes, capabilities: effectiveGoogleCapabilities(connection), connectedAt: connection.connectedAt } : null,
    tracker,
    companions,
    reviewTasks,
    candidates: decisions.map(decision => ({ ...decision, job: jobs.find(job => job.id === decision.jobId) ?? null })),
    sheet: sheet.rows,
    sheetStats: sheet.stats,
    audits,
  };
}

export async function savePreferences(userId: string, input: unknown) {
  const parsed = harnessPreferenceSchema.parse(input);
  const preferences: HarnessPreferences = {
    ...parsed,
    roles: [...new Set(parsed.roles.map(normalizeRoleLabel).filter(Boolean))],
  };
  return prisma.$transaction(async tx => {
    await ownerLock(tx, userId);
    const latest = await tx.harnessPreferenceVersion.findFirst({ where: { userId }, orderBy: { version: 'desc' } });
    const version = (latest?.version ?? 0) + 1;
    const saved = await tx.harnessPreferenceVersion.create({ data: { userId, version, preferences } });
    await tx.harnessAuditEvent.create({ data: { userId, action: 'PREFERENCES_SAVED', entityType: 'HarnessPreferenceVersion', entityId: saved.id, outcome: 'SUCCESS', metadata: { version, message: `Preferences version ${version} saved for ${preferences.roles.join(', ') || 'no roles'}.` } } });
    return { ...saved, preferences };
  });
}

export async function startRun(userId: string, mode: string, request: { ip?: string | undefined; userAgent?: string | undefined }) {
  return prisma.$transaction(async tx => {
    await ownerLock(tx, userId);
    const active = await tx.harnessRun.findFirst({ where: { userId, state: { in: ['SCHEDULED', 'RUNNING', 'PAUSED', 'WAITING_FOR_USER'] } } });
    if (active) throw new AppError(409, 'Finish or cancel the active harness run first.');
    const preference = await tx.harnessPreferenceVersion.findFirst({ where: { userId }, orderBy: { version: 'desc' } });
    if (!preference) throw new AppError(400, 'Save harness preferences before starting.');
    const parsed = harnessPreferenceSchema.parse(preference.preferences);
    if (!parsed.roles.length) throw new AppError(400, 'Add at least one desired role before starting.');
    if (mode === 'AUTO_APPLY' && (!parsed.allowedAutoApplyDomains.length || parsed.requireApprovalBeforeSubmit)) {
      throw new AppError(400, 'Auto apply needs an allowed domain and disabled per-submit approval.');
    }
    const run = await tx.harnessRun.create({ data: { userId, preferenceVersionId: preference.id, mode, steps: { create: STEP_KEYS.map((key, position) => ({ userId, key, position })) } }, include: { steps: { orderBy: { position: 'asc' } } } });
    await tx.consentGrant.create({ data: { userId, kind: 'HARNESS_RUN', scope: { runId: run.id, mode, preferenceVersion: preference.version }, ...(request.ip ? { sourceIp: request.ip } : {}), ...(request.userAgent ? { userAgent: request.userAgent } : {}) } });
    await tx.harnessAuditEvent.create({ data: { userId, runId: run.id, action: 'RUN_STARTED', entityType: 'HarnessRun', entityId: run.id, outcome: 'QUEUED', metadata: { mode, preferenceVersion: preference.version, message: `Run queued in ${mode.toLowerCase().replaceAll('_', ' ')} mode.` } } });
    return run;
  });
}

export async function controlRun(userId: string, runId: string, action: 'pause' | 'resume' | 'cancel' | 'emergency-stop') {
  const result = await prisma.$transaction(async tx => {
    await ownerLock(tx, userId);
    const run = await tx.harnessRun.findFirst({ where: { id: runId, userId } });
    if (!run) throw new AppError(404, 'Harness run not found.');
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.state)) throw new AppError(409, 'This harness run has already finished.');
    const assigned = await tx.browserTask.findMany({
      where: { userId, runId, deviceId: { not: null }, state: { notIn: ['COMPLETED', 'SUBMITTED', 'FAILED', 'CANCELLED'] } },
      select: { id: true, deviceId: true },
    });
    const now = new Date();
    if (action === 'pause') {
      if (!['SCHEDULED', 'RUNNING', 'WAITING_FOR_USER'].includes(run.state)) throw new AppError(409, 'This run cannot be paused.');
      await tx.harnessRun.update({ where: { id: run.id }, data: { state: 'PAUSED', pausedAt: now } });
    } else if (action === 'resume') {
      if (!['PAUSED', 'WAITING_FOR_USER'].includes(run.state)) throw new AppError(409, 'This run cannot be resumed.');
      await tx.harnessRun.update({ where: { id: run.id }, data: { state: 'SCHEDULED', pausedAt: null } });
      await tx.harnessStep.updateMany({ where: { runId: run.id, state: 'BLOCKED' }, data: { state: 'PENDING', blocker: null, error: null, startedAt: null, finishedAt: null, nextAttemptAt: now } });
    } else {
      await tx.harnessRun.update({ where: { id: run.id }, data: { state: 'CANCELLED', stoppedAt: now, finishedAt: now } });
      await tx.harnessStep.updateMany({ where: { runId: run.id, state: { in: ['PENDING', 'RUNNING', 'RETRYABLE', 'BLOCKED'] } }, data: { state: 'CANCELLED', finishedAt: now } });
      await tx.browserTask.updateMany({ where: { runId: run.id, state: { in: ['QUEUED', 'CLAIMED', 'OPENED', 'FILLED', 'WAITING_FOR_USER', 'PAUSED', 'TAKEOVER', 'BLOCKED'] } }, data: { state: 'CANCELLED', finishedAt: now } });
    }
    await tx.harnessAuditEvent.create({ data: { userId, runId, action: action === 'emergency-stop' ? 'EMERGENCY_STOP' : `RUN_${action.toUpperCase()}`, entityType: 'HarnessRun', entityId: runId, outcome: 'SUCCESS', metadata: { message: action === 'resume' ? 'Run resumed.' : action === 'pause' ? 'Run paused.' : 'Run stopped.' } } });
    return { run: await tx.harnessRun.findUnique({ where: { id: runId }, include: { steps: { orderBy: { position: 'asc' } } } }), assigned };
  });
  // Existing browser companions keep polling the REST task endpoints. Paired
  // local workers additionally receive the same run control over the gateway.
  const workerAction = action === 'cancel' || action === 'emergency-stop' ? 'stop' : action;
  const { assigned } = result;
  if (assigned.length) {
    void import('../worker/worker.gateway').then(({ workerGateway }) => {
      for (const task of assigned) {
        if (task.deviceId) workerGateway.sendControl(task.deviceId, task.id, workerAction);
      }
    }).catch(() => undefined);
  }
  return result.run;
}

export async function pairBrowserCompanion(userId: string, name: string) {
  const token = `pai_${randomBytes(32).toString('base64url')}`;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const companion = await prisma.browserCompanion.create({ data: { userId, name, tokenHash, expiresAt: new Date(Date.now() + 180 * 86_400_000) } });
  await prisma.harnessAuditEvent.create({ data: { userId, action: 'BROWSER_COMPANION_PAIRED', entityType: 'BrowserCompanion', entityId: companion.id, outcome: 'SUCCESS' } });
  return { id: companion.id, name: companion.name, token, expiresAt: companion.expiresAt };
}

export async function revokeBrowserCompanion(userId: string, id: string) {
  const result = await prisma.browserCompanion.updateMany({ where: { id, userId, revokedAt: null }, data: { status: 'REVOKED', revokedAt: new Date() } });
  if (!result.count) throw new AppError(404, 'Browser companion not found.');
  return { revoked: true };
}

export async function companionFromToken(rawToken: string) {
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const companion = await prisma.browserCompanion.findUnique({ where: { tokenHash } });
  if (!companion || companion.status !== 'ACTIVE' || companion.revokedAt || companion.expiresAt < new Date()) throw new AppError(401, 'Browser companion token is invalid or expired.');
  await prisma.browserCompanion.update({ where: { id: companion.id }, data: { lastSeenAt: new Date() } });
  return companion;
}

export async function claimBrowserTask(userId: string) {
  return prisma.$transaction(async tx => {
    await ownerLock(tx, userId);
    await tx.browserTask.updateMany({ where: { userId, state: 'CLAIMED', claimedAt: { lt: new Date(Date.now() - 15 * 60_000) } }, data: { state: 'WAITING_FOR_USER', error: 'Browser companion was interrupted. Verify the page before retrying.' } });
    const activeRuns = await tx.harnessRun.findMany({ where: { userId, state: { in: ['SCHEDULED', 'RUNNING', 'WAITING_FOR_USER'] } }, select: { id: true } });
    const task = await tx.browserTask.findFirst({ where: {
      userId, state: 'QUEUED', deviceId: null,
      OR: [{ runId: null }, { runId: { in: activeRuns.map(run => run.id) } }],
    }, orderBy: { createdAt: 'asc' } });
    if (!task) return null;
    if (task.jobId && task.adapter !== 'SEARCH') {
      const job = await tx.job.findFirst({ where: { id: task.jobId, userId }, select: { company: true } });
      if (!job || companyNeedsVerification(job.company)) {
        await tx.browserTask.update({ where: { id: task.id }, data: { state: 'BLOCKED', error: 'Verify the employer before preparing this application.' } });
        return null;
      }
    }
    const claimed = await tx.browserTask.updateMany({ where: { id: task.id, state: 'QUEUED' }, data: { state: 'CLAIMED', claimedAt: new Date() } });
    if (!claimed.count) return null;
    return tx.browserTask.findUnique({ where: { id: task.id } });
  });
}

export async function reportBrowserTask(userId: string, taskId: string, report: { state: string; adapter: string; blocker?: string | undefined; unknownFields: string[]; confirmation?: { url?: string | undefined; text?: string | undefined } | undefined }) {
  return prisma.$transaction(async tx => {
    await ownerLock(tx, userId);
    const task = await tx.browserTask.findFirst({ where: { id: taskId, userId } });
    if (!task) throw new AppError(404, 'Browser task not found.');
    if (task.deviceId) throw new AppError(409, 'This task belongs to a paired worker.');
    const run = task.runId ? await tx.harnessRun.findFirst({ where: { id: task.runId, userId }, select: { state: true } }) : null;
    if (task.state === 'CANCELLED' || run?.state === 'CANCELLED' || (task.runId && !run)) throw new AppError(409, 'Browser task was cancelled.');
    if (['COMPLETED', 'SUBMITTED', 'FAILED'].includes(task.state)) {
      if (task.state === report.state) return task;
      throw new AppError(409, 'Browser task has already finished.');
    }
    if (task.state === 'QUEUED') throw new AppError(409, 'Claim the browser task before reporting progress.');
    const terminal = ['COMPLETED', 'SUBMITTED', 'BLOCKED', 'FAILED'].includes(report.state);
    const updated = await tx.browserTask.update({ where: { id: task.id }, data: { state: report.state, adapter: report.adapter, result: report, error: report.blocker ?? null, finishedAt: terminal ? new Date() : null } });
    if (report.state === 'SUBMITTED') {
      if (!task.jobId) throw new AppError(409, 'Submitted browser task has no job.');
      const job = await tx.job.findFirst({ where: { id: task.jobId, userId } });
      if (!job) throw new AppError(404, 'Job not found for submitted task.');
      const application = task.applicationId
        ? await tx.jobApplication.findFirst({ where: { id: task.applicationId, userId } })
        : await tx.jobApplication.findFirst({ where: { userId, jobId: job.id } });
      const saved = application
        ? await tx.jobApplication.update({ where: { id: application.id }, data: { status: 'APPLIED', appliedAt: new Date() } })
        : await tx.jobApplication.create({ data: { userId, jobId: job.id, company: job.company, role: job.title, jobUrl: job.canonicalUrl, location: job.location, status: 'APPLIED' } });
      await tx.applicationEvent.create({ data: { userId, applicationId: saved.id, type: 'STATUS_CHANGE', payload: { source: 'BROWSER_COMPANION', taskId, confirmation: report.confirmation ?? null } } });
      await tx.browserTask.update({ where: { id: task.id }, data: { applicationId: saved.id } });
    }
    await tx.harnessAuditEvent.create({ data: { userId, runId: task.runId, action: 'BROWSER_TASK_REPORTED', entityType: 'BrowserTask', entityId: task.id, outcome: report.state, metadata: { adapter: report.adapter, unknownFields: report.unknownFields, message: report.blocker ?? (task.adapter === 'SEARCH' ? 'Search tab finished loading.' : report.state === 'COMPLETED' ? 'Application tab completed.' : `Browser task is ${report.state.toLowerCase().replaceAll('_', ' ')}.`) } } });
    if (task.runId) {
      const remaining = await tx.browserTask.count({ where: { runId: task.runId, state: { in: ['QUEUED', 'CLAIMED', 'OPENED', 'FILLED', 'WAITING_FOR_USER', 'BLOCKED'] } } });
      if (!remaining) {
        const failed = await tx.browserTask.count({ where: { runId: task.runId, state: 'FAILED' } });
        await tx.harnessRun.updateMany({ where: { id: task.runId, userId, state: 'WAITING_FOR_USER' }, data: { state: failed ? 'PARTIAL' : 'COMPLETED', finishedAt: new Date(), error: failed ? 'One or more browser tasks failed.' : null } });
      }
    }
    return updated;
  });
}

export async function approveBrowserTask(userId: string, taskId: string) {
  return prisma.$transaction(async tx => {
    await ownerLock(tx, userId);
    const task = await tx.browserTask.findFirst({ where: { id: taskId, userId } });
    if (!task || !['WAITING_FOR_USER', 'BLOCKED'].includes(task.state)) throw new AppError(409, 'Browser task is not waiting for approval.');
    if (task.deviceId) throw new AppError(409, 'Review this task in the local worker approval queue.');
    if (task.runId) {
      const run = await tx.harnessRun.findFirst({ where: { id: task.runId, userId } });
      if (!run || ['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.state)) throw new AppError(409, 'This harness run has already finished.');
    }
    return tx.browserTask.update({ where: { id: task.id }, data: { state: 'QUEUED', approvedAt: new Date(), error: null } });
  });
}

export function parseStoredPreferences(value: unknown): HarnessPreferences {
  return harnessPreferenceSchema.parse(value);
}

export const idSchema = z.string().cuid();
