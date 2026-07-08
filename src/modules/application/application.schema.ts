import { z } from 'zod';

export const applicationStatusEnum = z.enum([
  'APPLIED',
  'INTERVIEW',
  'OFFER',
  'REJECTED',
  'WITHDRAWN',
]);

export const createApplicationSchema = z.object({
  body: z.object({
    company: z.string().min(1).max(120),
    role: z.string().min(1).max(120),
    status: applicationStatusEnum.optional(),
    jobUrl: z.string().url().optional().or(z.literal('')),
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
    jobUrl: z.string().url().optional().or(z.literal('')),
    location: z.string().max(120).optional(),
    appliedAt: z.string().datetime().optional(),
    notes: z.string().max(2000).optional(),
    resumeId: z.string().nullable().optional(),
  }),
  params: z.object({ id: z.string().min(1) }),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>['body'];
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>['body'];
