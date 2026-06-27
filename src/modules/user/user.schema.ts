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
