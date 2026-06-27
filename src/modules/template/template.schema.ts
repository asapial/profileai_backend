import { z } from 'zod';

export const createTemplateSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Template name is required').max(100),
    description: z.string().max(500).optional(),
    thumbnailUrl: z.string().optional().default(''),
    htmlLayout: z.string().min(10, 'HTML layout is required'),
    cssStyles: z.string().optional().default(''),
    category: z.enum(['MODERN', 'CLASSIC', 'CREATIVE', 'ATS']),
    isActive: z.coerce.boolean().optional().default(true),
    isDefault: z.coerce.boolean().optional().default(false),
  }),
});

export const updateTemplateSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    htmlLayout: z.string().min(10).optional(),
    cssStyles: z.string().optional(),
    category: z.enum(['MODERN', 'CLASSIC', 'CREATIVE', 'ATS']).optional(),
    isActive: z.coerce.boolean().optional(),
    isDefault: z.coerce.boolean().optional(),
  }),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>['body'];
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>['body'];
