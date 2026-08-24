import { z } from 'zod';

export const createTemplateSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Template name is required').max(100),
    description: z.string().max(500).optional(),
    thumbnailUrl: z.string().optional().default(''),
    htmlLayout: z.string().min(10, 'HTML layout is required'),
    cssStyles: z.string().optional().default(''),
    category: z.enum(['MODERN', 'CLASSIC', 'CREATIVE', 'ATS']),
    documentType: z.enum(['RESUME', 'CV']).optional().default('RESUME'),
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
    documentType: z.enum(['RESUME', 'CV']).optional(),
    isActive: z.coerce.boolean().optional(),
    isDefault: z.coerce.boolean().optional(),
  }),
});

export const templateCustomizationSchema = z.object({
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex color.').optional(),
  fontFamily: z.enum(['Inter', 'Source Sans 3', 'IBM Plex Sans', 'Georgia', 'Arial', 'Merriweather']).optional(),
  spacing: z.enum(['compact', 'comfortable', 'airy']).optional(),
  headingStyle: z.enum(['uppercase', 'title', 'minimal']).optional(),
});

export const forkUserTemplateSchema = z.object({
  body: z.object({
    sourceTemplateId: z.string().min(1),
    name: z.string().min(3).max(100).optional(),
  }),
});

export const updateUserTemplateSchema = z.object({
  body: z.object({
    name: z.string().min(3).max(100).optional(),
    description: z.string().max(500).optional(),
    category: z.enum(['MODERN', 'CLASSIC', 'CREATIVE', 'ATS']).optional(),
    documentType: z.enum(['RESUME', 'CV']).optional(),
    customization: templateCustomizationSchema.optional(),
  }).refine((data) => Object.keys(data).length > 0, 'Provide at least one change.'),
});

export const reviewUserTemplateSchema = z.object({
  body: z.object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    reason: z.string().max(500).optional(),
  }).superRefine((data, ctx) => {
    if (data.decision === 'REJECTED' && !data.reason?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A rejection reason is required.' });
    }
  }),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>['body'];
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>['body'];
export type TemplateCustomizationInput = z.infer<typeof templateCustomizationSchema>;
export type ForkUserTemplateInput = z.infer<typeof forkUserTemplateSchema>['body'];
export type UpdateUserTemplateInput = z.infer<typeof updateUserTemplateSchema>['body'];
export type ReviewUserTemplateInput = z.infer<typeof reviewUserTemplateSchema>['body'];
