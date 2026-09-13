import { z } from 'zod';
import { normalizeJobUrl } from './job.identity';

export const jobLifecycleEnum = z.enum(['ACTIVE', 'POSSIBLY_EXPIRED', 'EXPIRED', 'REMOVED', 'UNKNOWN']);
export const workplaceTypeEnum = z.enum(['REMOTE', 'HYBRID', 'ON_SITE', 'UNSPECIFIED']);

const jobBody = z.object({
  title: z.string().trim().min(2).max(160),
  company: z.string().trim().min(2).max(160),
  description: z.string().trim().min(20).max(100_000),
  location: z.string().trim().max(160).optional(),
  workplaceType: workplaceTypeEnum.optional(),
  employmentType: z.string().trim().max(80).optional(),
  salaryMin: z.number().nonnegative().optional(),
  salaryMax: z.number().nonnegative().optional(),
  salaryCurrency: z.string().trim().length(3).optional(),
  salaryPeriod: z.string().trim().max(30).optional(),
  salaryIsEstimated: z.boolean().optional(),
  canonicalUrl: z.string().refine(value => { try { normalizeJobUrl(value); return true; } catch { return false; } }, 'Use an HTTP or HTTPS job URL without credentials.').optional(),
  sourceName: z.string().trim().max(120).optional(),
  publishedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
});

const validateSalary = (value: { salaryMin?: number | undefined; salaryMax?: number | undefined }, ctx: z.RefinementCtx) => {
  if (value.salaryMin !== undefined && value.salaryMax !== undefined && value.salaryMin > value.salaryMax) {
    ctx.addIssue({ code: 'custom', path: ['salaryMax'], message: 'Maximum salary must be greater than minimum salary.' });
  }
};

export const createJobSchema = z.object({ body: jobBody.superRefine(validateSalary) });
export const updateJobSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: jobBody.partial().extend({ lifecycle: jobLifecycleEnum.optional() }).superRefine(validateSalary),
});
export const jobIdSchema = z.object({ params: z.object({ id: z.string().min(1) }) });
export const createApplicationFromJobSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    status: z.enum(['SAVED', 'PREPARING', 'APPLIED']).optional(),
    resumeId: z.string().optional(),
    notes: z.string().max(2000).optional(),
  }),
});

export type CreateJobInput = z.infer<typeof jobBody>;
export type UpdateJobInput = Partial<CreateJobInput> & { lifecycle?: z.infer<typeof jobLifecycleEnum> };

export const listJobsSchema = z.object({ query: z.object({ lifecycle: jobLifecycleEnum.optional(), query: z.string().trim().max(200).optional(), limit: z.coerce.number().int().min(1).max(100).optional() }) });
