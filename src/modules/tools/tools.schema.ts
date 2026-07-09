import { z } from 'zod';

export const analyzeJdSchema = z.object({
  body: z.object({
    jobDescription: z
      .string()
      .min(50, 'Job description must be at least 50 characters.')
      .max(20_000, 'Job description must be 20000 characters or fewer.'),
    resumeId: z.string().min(1).optional(),
  }),
});

export const analyzeJdResponseSchema = z.object({
  jobTitle: z.string(),
  seniority: z.string(),
  skillsRequired: z.array(z.string()),
  skillsPreferred: z.array(z.string()),
  responsibilities: z.array(z.string()),
  keywords: z.array(z.string()),
  redFlags: z.array(z.string()),
  suggestedResumeFocus: z.array(z.string()),
});

export type AnalyzeJdInput = z.infer<typeof analyzeJdSchema>['body'];
export type AnalyzeJdResponse = z.infer<typeof analyzeJdResponseSchema>;
