import { z } from 'zod';

export const createReferenceSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120),
    relationship: z.string().min(1).max(120),
    company: z.string().max(120).optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().max(30).optional(),
  }),
});

export const updateReferenceSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120).optional(),
    relationship: z.string().min(1).max(120).optional(),
    company: z.string().max(120).optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().max(30).optional(),
  }),
});

export type CreateReferenceInput = z.infer<typeof createReferenceSchema>['body'];
export type UpdateReferenceInput = z.infer<typeof updateReferenceSchema>['body'];
