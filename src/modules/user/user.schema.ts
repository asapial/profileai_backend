import { z } from 'zod';

// ─── Update Profile ───────────────────────────────────
export const updateProfileSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).max(50).optional(),
    lastName: z.string().min(1).max(50).optional(),
    phone: z.string().max(20).optional(),
    headline: z.string().max(100).optional(),
    bio: z.string().max(500).optional(),
    location: z.string().max(100).optional(),
    website: z.string().url('Invalid URL').optional().or(z.literal('')),
    linkedIn: z.string().url('Invalid LinkedIn URL').optional().or(z.literal('')),
    github: z.string().url('Invalid GitHub URL').optional().or(z.literal('')),
    avatarUrl: z.string().url('Invalid avatar URL').optional().or(z.literal('')),
    skills: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional(),
    education: z.array(z.object({
      school: z.string(),
      degree: z.string(),
      field: z.string(),
      from: z.string(),
      to: z.string().optional(),
      gpa: z.string().optional(),
    })).optional(),
    experience: z.array(z.object({
      company: z.string(),
      role: z.string(),
      from: z.string(),
      to: z.string().optional(),
      current: z.boolean().optional(),
      desc: z.string().optional(),
    })).optional(),
    certifications: z.array(z.object({
      name: z.string(),
      issuer: z.string(),
      year: z.string().optional(),
      url: z.string().url().optional().or(z.literal('')),
    })).optional(),
  }),
});

// ─── Change Password ──────────────────────────────────
export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain an uppercase letter')
      .regex(/[0-9]/, 'Must contain a number')
      .regex(/[^A-Za-z0-9]/, 'Must contain a special character'),
    confirmPassword: z.string(),
  }).refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>['body'];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>['body'];

const dateField = z.string().refine(value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)), 'Use a valid date.');
export const updateExperiencesSchema = z.object({ body: z.object({ items: z.array(z.object({
  id: z.string().optional(), company: z.string().trim().min(1).max(200), role: z.string().trim().min(1).max(200),
  startDate: dateField, endDate: dateField.nullable().optional(), current: z.boolean().optional(), description: z.string().max(10000).optional(),
}).refine(item => item.current || !item.startDate || !item.endDate || item.endDate >= item.startDate, 'End date must follow start date.')).max(100) }) });

export const updateEducationsSchema = z.object({ body: z.object({ items: z.array(z.object({
  id: z.string().optional(), school: z.string().trim().min(1).max(200), degree: z.string().trim().min(1).max(200), field: z.string().max(200).optional(),
  startYear: z.number().int().min(1900).max(2200), endYear: z.number().int().min(1900).max(2200).nullable().optional(),
}).refine(item => item.endYear == null || item.endYear >= item.startYear, 'End year must follow start year.')).max(100) }) });

export const updateSkillsSchema = z.object({ body: z.object({ items: z.array(z.union([
  z.string().trim().min(1).max(100), z.object({ name: z.string().trim().min(1).max(100) }),
])).max(200) }) });

export const notificationPreferencesSchema = z.object({ body: z.object({
  emailMarketing: z.boolean().optional(), emailProduct: z.boolean().optional(), emailSecurity: z.boolean().optional(),
  emailResumeTips: z.boolean().optional(), pushEnabled: z.boolean().optional(), inAppEnabled: z.boolean().optional(),
  digestFrequency: z.enum(['OFF', 'DAILY', 'WEEKLY']).optional(),
}) });

export const trustDeviceSchema = z.object({
  body: z.object({ isTrusted: z.boolean() }),
});
