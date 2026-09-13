import { z } from 'zod';
export const evidenceBody = z.object({ title: z.string().trim().min(2).max(160), statement: z.string().trim().min(10).max(3000),
  technologies: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  status: z.enum(['USER_CONFIRMED', 'INFERRED', 'MISSING']).default('USER_CONFIRMED'),
  source: z.string().trim().min(2).max(500), details: z.object({ project: z.string().max(300).optional(), situation: z.string().max(1000).optional(), task: z.string().max(1000).optional(), action: z.string().max(1000).optional(), result: z.string().max(1000).optional(), metrics: z.string().max(300).optional(), teamSize: z.number().int().positive().optional(), dates: z.string().max(100).optional() }).default({}) });
export const draftBody = z.object({ jobId: z.string().min(1), resumeId: z.string().optional(), evidenceIds: z.array(z.string()).max(10).default([]),
  kind: z.enum(['APPLICATION', 'OUTREACH', 'FOLLOW_UP', 'THANK_YOU', 'REFERRAL', 'COVER_LETTER']).default('APPLICATION'),
  tone: z.enum(['neutral', 'warm', 'confident']).default('neutral'), length: z.enum(['short', 'standard']).default('standard'), recipientName: z.string().max(100).optional() });
export const editDraftBody = z.object({ subject: z.string().min(1).max(200).regex(/^[^\r\n]*$/), body: z.string().min(1).max(20000), recipient: z.email().optional(), reviewed: z.boolean().default(false) });
export const preferenceBody = z.object({ roles: z.array(z.string().max(100)).max(10), locations: z.array(z.string().max(100)).max(10), industries: z.array(z.string().max(100)).max(10), workplace: z.enum(['ANY', 'REMOTE', 'HYBRID', 'ON_SITE']), salaryMin: z.number().nonnegative().nullable().optional(), salaryCurrency: z.string().regex(/^[A-Z]{3}$/).nullable().optional() });

export const styleBody = z.object({ tone: z.enum(["neutral", "warm", "confident"]), length: z.enum(["short", "standard"]) });
