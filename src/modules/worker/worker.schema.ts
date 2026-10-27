import { z } from 'zod';

const code = z.string().trim().min(6).max(24);
const publicKey = z.string().min(40).max(2000);
const workerEventType = z.enum([
  'RUN_STARTED',
  'OBSERVE',
  'PLAN',
  'POLICY_ALLOW',
  'POLICY_BLOCK',
  'ACT',
  'VERIFY_PASS',
  'VERIFY_FAIL',
  'PROGRESS',
  'JOB_CAPTURED',
  'JOB_SHORTLISTED',
  'APPROVAL_REQUESTED',
  'APPROVAL_DECIDED',
  'SENSITIVE_STOP',
  'TAKEOVER_STARTED',
  'TAKEOVER_ENDED',
  'PAUSED',
  'RESUMED',
  'CHECKPOINT',
  'BLOCKED',
  'ERROR',
  'STOPPED',
  'SUBMITTED',
  'RUN_COMPLETED',
]);

export const workerPairSchema = z.object({
  code,
  name: z.string().trim().min(2).max(80),
  platform: z.string().trim().min(2).max(40).default('windows'),
  appVersion: z.string().trim().min(1).max(40),
  publicKey,
  capabilities: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
});

export const workerRefreshSchema = z.object({
  deviceId: z.string().trim().min(1).max(200),
  refreshToken: z.string().trim().min(20).max(500),
});

export const workerEventSchema = z.object({
  seq: z.number().int().min(0),
  taskId: z.string().trim().min(1).max(200),
  at: z.string().min(1).max(80),
  type: workerEventType,
  message: z.string().max(2000).default(''),
  data: z.record(z.string(), z.unknown()).default({}),
  redacted: z.boolean().default(true),
});

export const workerEventsSchema = z.object({
  events: z.array(workerEventSchema).min(1).max(200),
});

export const workerCheckpointSchema = z.object({
  taskId: z.string().trim().min(1).max(200),
  deviceId: z.string().trim().min(1).max(200),
  sequence: z.number().int().min(0),
  state: z.string().trim().min(1).max(80),
  url: z.string().max(4000).default(''),
  step: z.string().max(200).default(''),
  observationHash: z.string().max(128).default(''),
  completedActions: z.array(z.string().max(300)).max(500).default([]),
  submitted: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().min(1).max(80),
});

export const workerResultSchema = z.object({
  state: z.enum(['CLAIMED', 'OPENED', 'FILLED', 'WAITING_FOR_USER', 'PAUSED', 'TAKEOVER', 'COMPLETED', 'SUBMITTED', 'BLOCKED', 'FAILED', 'CANCELLED']),
  adapter: z.string().trim().max(80).default(''),
  blocker: z.string().max(2000).optional(),
  unknownFields: z.array(z.string().max(300)).max(200).default([]),
  progress: z.number().int().min(0).max(100).optional(),
  confirmation: z.object({ url: z.string().max(4000).optional(), text: z.string().max(2000).optional() }).optional(),
  summary: z.record(z.string(), z.unknown()).default({}),
}).superRefine((value, ctx) => {
  if (value.state !== 'SUBMITTED') return;
  if (!value.confirmation?.url?.trim() && !value.confirmation?.text?.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['confirmation'],
      message: 'A submitted result needs visible confirmation evidence.',
    });
  }
});

export const workerApprovalSchema = z.object({
  taskId: z.string().trim().min(1).max(200),
  deviceId: z.string().trim().min(1).max(200),
  kind: z.enum(['SUBMIT', 'UPLOAD', 'SALARY', 'SENSITIVE_FIELD', 'LEGAL', 'LOGIN', 'CAPTURE', 'DRAFT']),
  summary: z.string().trim().min(1).max(2000),
  targetUrl: z.string().max(4000).default(''),
  risk: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  expiresAt: z.string().min(1).max(80),
  evidence: z.record(z.string(), z.unknown()).default({}),
});

export const workerApprovalDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED', 'TAKEOVER']),
  note: z.string().trim().max(1000).default(''),
});

export const workerControlSchema = z.object({
  action: z.enum(['pause', 'resume', 'stop', 'takeover', 'handback']),
});

export const workerPairingCodeSchema = z.object({
  nameHint: z.string().trim().max(80).optional(),
});

const workerSource = z.enum(['GREENHOUSE', 'LEVER', 'ASHBY', 'REMOTIVE', 'COMPANY_CAREER', 'FACEBOOK', 'LINKEDIN', 'BDJOBS', 'MANUAL']);

const jobSearchSource = z.enum([
  'REMOTIVE',
  'JOBICY',
  'ARBEITNOW',
  'GREENHOUSE',
  'LEVER',
  'FACEBOOK',
  'LINKEDIN',
  'BDJOBS',
]);

export const workerAuthStartSchema = z.object({
  deviceName: z.string().trim().min(2).max(80),
  platform: z.string().trim().min(2).max(40).default('windows'),
  appVersion: z.string().trim().min(1).max(40),
  publicKey,
  capabilities: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
});

export const workerAuthPollSchema = z.object({
  requestId: z.string().trim().min(1).max(200),
  secret: z.string().trim().min(20).max(500),
});

export const workerAuthDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'DENY']),
});

export const workerConsentUpsertSchema = z.object({
  search: z.boolean().default(false),
  scroll: z.boolean().default(false),
  capture: z.boolean().default(false),
  maxPages: z.number().int().min(1).max(10).default(1),
  acknowledgedRisk: z.boolean().default(false),
});

export const workerSearchTaskSchema = z.object({
  source: workerSource.optional(),
  startUrl: z.string().url().max(4000).optional(),
  query: z.string().trim().max(200).optional(),
  company: z.string().trim().min(2).max(120).optional(),
  maxPages: z.number().int().min(1).max(10).default(1),
  maxResults: z.number().int().min(1).max(25).default(10),
  scrollRounds: z.number().int().min(0).max(20).default(0),
  mode: z.enum(['RESEARCH', 'DRAFT']).default('RESEARCH'),
  consentAcknowledged: z.boolean(),
}).refine(value => Boolean(value.startUrl || value.query || (value.source === 'COMPANY_CAREER' && value.company)), {
  message: 'Provide a company, start URL or search query.',
  path: ['query'],
});

export const workerCaptureTaskSchema = z.object({
  url: z.string().url().max(4000),
  source: workerSource.optional(),
  consentAcknowledged: z.boolean(),
});

export const hybridJobSearchSchema = z.object({
  query: z.string().trim().min(2).max(200),
  sources: z.array(jobSearchSource).min(1).max(8).default(['REMOTIVE', 'JOBICY', 'ARBEITNOW']),
  maxResults: z.number().int().min(1).max(50).default(20),
  maximumAgeDays: z.number().int().min(1).max(90).default(30),
  privateSourceConsent: z.boolean().default(false),
});

export const workerCapturedListingSchema = z.object({
  source: workerSource,
  externalId: z.string().max(300).default(''),
  canonicalUrl: z.string().url().max(4000),
  title: z.string().min(1).max(300),
  company: z.string().min(1).max(300),
  location: z.string().max(300).default(''),
  workplaceType: z.enum(['REMOTE', 'HYBRID', 'ONSITE', 'UNKNOWN']).default('UNKNOWN'),
  employmentType: z.string().max(100).default(''),
  description: z.string().max(80_000).default(''),
  salaryMin: z.number().nonnegative().nullable().default(null),
  salaryMax: z.number().nonnegative().nullable().default(null),
  salaryCurrency: z.string().max(10).default(''),
  publishedAt: z.string().max(80).default(''),
  capturedAt: z.string().min(1).max(80),
  missingFields: z.array(z.string().max(100)).max(40).default([]),
});

export const workerListingBatchSchema = z.object({
  listings: z.array(workerCapturedListingSchema).min(1).max(50),
});

export type WorkerPairInput = z.infer<typeof workerPairSchema>;
export type WorkerResultInput = z.infer<typeof workerResultSchema>;
export type WorkerAuthStartInput = z.infer<typeof workerAuthStartSchema>;
export type WorkerAuthPollInput = z.infer<typeof workerAuthPollSchema>;
export type WorkerConsentInput = z.infer<typeof workerConsentUpsertSchema>;
export type WorkerSearchTaskInput = z.infer<typeof workerSearchTaskSchema>;
export type WorkerCaptureTaskInput = z.infer<typeof workerCaptureTaskSchema>;
export type HybridJobSearchInput = z.infer<typeof hybridJobSearchSchema>;
