import { z } from 'zod';
import { normalizeJobUrl } from '../job/job.identity';

export const applicationStatusEnum = z.enum([
  'SAVED',
  'PREPARING',
  'APPLIED',
  'FOLLOW_UP_DUE',
  'RECRUITER_SCREEN',
  'INTERVIEW',
  'ASSESSMENT',
  'OFFER',
  'REJECTED',
  'WITHDRAWN',
]);

export const createApplicationSchema = z.object({
  body: z.object({
    company: z.string().min(1).max(120),
    role: z.string().min(1).max(120),
    status: applicationStatusEnum.optional(),
    jobUrl: z.string().refine(value => { try { normalizeJobUrl(value); return true; } catch { return false; } }, 'Use an HTTP or HTTPS job URL.').optional(),
    location: z.string().max(120).optional(),
    appliedAt: z.string().datetime().optional(),
    notes: z.string().max(2000).optional(),
    resumeId: z.string().optional(),
  }),
});

export const updateApplicationSchema = z.object({
  body: z.object({
    company: z.string().min(1).max(120).optional(),
    role: z.string().min(1).max(120).optional(),
    status: applicationStatusEnum.optional(),
    jobUrl: z.string().refine(value => { try { normalizeJobUrl(value); return true; } catch { return false; } }, 'Use an HTTP or HTTPS job URL.').optional(),
    location: z.string().max(120).optional(),
    appliedAt: z.string().datetime().optional(),
    notes: z.string().max(2000).optional(),
    resumeId: z.string().nullable().optional(),
    coverLetterId: z.string().nullable().optional(),
    reminderAt: z.string().datetime().nullable().optional(),
    nextAction: z.string().max(500).nullable().optional(),
    contactName: z.string().max(160).nullable().optional(),
    contactEmail: z.email().nullable().optional(),
    deadlineAt: z.string().datetime().nullable().optional(),
  }),
  params: z.object({ id: z.string().min(1) }),
});

export const patchStatusSchema = z.object({
  body: z.object({
    status: applicationStatusEnum,
  }),
  params: z.object({ id: z.string().min(1) }),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>['body'];
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>['body'];
export type PatchStatusInput = z.infer<typeof patchStatusSchema>['body'];
