import { z } from 'zod';

export const createProjectSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(120),
    description: z.string().max(2000).optional(),
    techStack: z.array(z.string()).default([]),
    url: z.string().url().optional().or(z.literal('')),
    repoUrl: z.string().url().optional().or(z.literal('')),
    startDate: z.string().max(20).optional(),
    endDate: z.string().max(20).optional(),
    current: z.boolean().optional(),
  }),
});

export const updateProjectSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).optional(),
    techStack: z.array(z.string()).optional(),
    url: z.string().url().optional().or(z.literal('')),
    repoUrl: z.string().url().optional().or(z.literal('')),
    startDate: z.string().max(20).optional(),
    endDate: z.string().max(20).optional(),
    current: z.boolean().optional(),
  }),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>['body'];
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>['body'];
