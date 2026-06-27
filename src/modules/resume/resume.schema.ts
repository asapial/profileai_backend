import { z } from 'zod';

// ─── Generate Resume ──────────────────────────────────
export const generateResumeSchema = z.object({
  body: z.object({
    templateId: z.string().min(1, 'Template ID is required'),
    title: z.string().min(1, 'Resume title is required').max(100),
    type: z.enum(['RESUME', 'CV']).default('RESUME'),
    targetJobTitle: z.string().min(1, 'Target job title is required').max(100),
    jobDescription: z.string().max(5000).optional(),
  }),
});

// ─── Update Resume ────────────────────────────────────
export const updateResumeSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(100).optional(),
    contentData: z.record(z.unknown()).optional(),
    targetJobTitle: z.string().max(100).optional(),
    jobDescription: z.string().max(5000).optional(),
  }),
});

// ─── ATS Check ───────────────────────────────────────
export const atsCheckSchema = z.object({
  body: z.object({
    jobDescription: z.string().min(10, 'Job description is required for ATS check').max(5000),
  }),
});

// ─── AI Modify Section ────────────────────────────────
export const aiModifySchema = z.object({
  body: z.object({
    section: z.string().min(1, 'Section name is required'),
    instruction: z.string().min(1, 'Instruction is required').max(500),
  }),
});

export type GenerateResumeInput = z.infer<typeof generateResumeSchema>['body'];
export type UpdateResumeInput = z.infer<typeof updateResumeSchema>['body'];
export type AtsCheckInput = z.infer<typeof atsCheckSchema>['body'];
export type AiModifyInput = z.infer<typeof aiModifySchema>['body'];
