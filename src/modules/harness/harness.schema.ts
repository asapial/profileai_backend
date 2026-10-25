import { z } from 'zod';

const shortList = (limit: number, size = 120) => z.array(z.string().trim().min(1).max(size)).max(limit);

export const harnessPreferenceSchema = z.object({
  roles: shortList(20),
  seniority: z.enum(['ANY', 'INTERN', 'ENTRY', 'JUNIOR', 'MID', 'SENIOR', 'LEAD']).default('ANY'),
  requiredSkills: shortList(40, 80).default([]),
  optionalSkills: shortList(40, 80).default([]),
  excludedSkills: shortList(40, 80).default([]),
  workplace: z.enum(['ANY', 'REMOTE', 'HYBRID', 'ON_SITE']).default('ANY'),
  preferredCountries: shortList(20).default([]),
  allowedCountries: shortList(30).default([]),
  workAuthorization: z.string().trim().max(300).default(''),
  requiresVisaSponsorship: z.boolean().nullable().default(null),
  minimumSalary: z.number().nonnegative().nullable().default(null),
  salaryCurrency: z.string().regex(/^[A-Z]{3}$/).default('USD'),
  employmentTypes: z.array(z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP'])).max(4).default(['FULL_TIME']),
  timeZones: shortList(12, 60).default([]),
  availability: z.string().trim().max(300).default(''),
  companySizes: shortList(8, 60).default([]),
  industries: shortList(20).default([]),
  excludedCompanies: shortList(100, 160).default([]),
  excludedSources: shortList(30, 160).default([]),
  maximumJobAgeDays: z.number().int().min(1).max(120).default(30),
  minimumMatchScore: z.number().int().min(0).max(100).default(72),
  dailySearchLimit: z.number().int().min(1).max(500).default(50),
  dailyApplicationLimit: z.number().int().min(1).max(50).default(5),
  autoSaveThreshold: z.number().int().min(0).max(100).default(65),
  autoPrepareThreshold: z.number().int().min(0).max(100).default(78),
  autoApplyThreshold: z.number().int().min(0).max(100).default(92),
  resumeStyle: z.enum(['ATS_CLASSIC', 'MODERN', 'COMPACT']).default('ATS_CLASSIC'),
  resumePageLimit: z.number().int().min(1).max(3).default(2),
  coverLetterStyle: z.enum(['CONCISE', 'STANDARD', 'DETAILED']).default('STANDARD'),
  emailTone: z.enum(['neutral', 'warm', 'confident']).default('neutral'),
  salaryAnswerPolicy: z.enum(['STOP', 'USE_MINIMUM', 'USE_RANGE']).default('STOP'),
  noticePeriod: z.string().trim().max(120).default(''),
  earliestStartDate: z.iso.date().nullable().default(null),
  relocation: z.enum(['YES', 'NO', 'DISCUSS']).default('DISCUSS'),
  portfolioUrls: z.array(z.url()).max(20).default([]),
  allowedAutoApplyDomains: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+$/)).max(50).default([]),
  requireApprovalBeforeSubmit: z.boolean().default(true),
  stopOnCaptcha: z.literal(true).default(true),
  stopOnOtp: z.literal(true).default(true),
  stopOnLegalAgreement: z.literal(true).default(true),
  stopOnUnknownRequiredQuestion: z.literal(true).default(true),
  neverAnswerDemographic: z.literal(true).default(true),
  neverAnswerDisability: z.literal(true).default(true),
  neverAnswerCriminalHistory: z.literal(true).default(true),
});

export type HarnessPreferences = z.infer<typeof harnessPreferenceSchema>;

export const DEFAULT_HARNESS_PREFERENCES: HarnessPreferences = harnessPreferenceSchema.parse({
  roles: [],
});

export const runModeSchema = z.enum(['RESEARCH', 'PREPARE', 'REVIEW_SUBMIT', 'AUTO_APPLY']);

export const startRunSchema = z.object({
  mode: runModeSchema.default('PREPARE'),
  consent: z.literal(true),
});

export const googleCapabilitySchema = z.enum([
  'DRIVE_DOCUMENTS',
  'DRIVE_APP_DATA',
  'SHEET_TRACKER',
  'GMAIL_DRAFTS',
  'GMAIL_SEND',
  'CALENDAR_EVENTS',
]);

export type GoogleCapabilityName = z.infer<typeof googleCapabilitySchema>;

export const connectGoogleSchema = z.object({
  capabilities: z.array(googleCapabilitySchema).min(1).max(6),
  popupOrigin: z.url(),
});

export const companionReportSchema = z.object({
  state: z.enum(['OPENED', 'FILLED', 'WAITING_FOR_USER', 'COMPLETED', 'SUBMITTED', 'BLOCKED', 'FAILED']),
  adapter: z.string().trim().min(1).max(80),
  blocker: z.string().trim().max(1000).optional(),
  unknownFields: z.array(z.string().max(300)).max(30).default([]),
  confirmation: z.object({ url: z.url().optional(), text: z.string().max(2000).optional() }).optional(),
});

export const trackerSchema = z.object({
  name: z.string().trim().min(2).max(100).default('ProfileAI Job Tracker'),
});

export const browserPairSchema = z.object({
  name: z.string().trim().min(2).max(80).default('My browser'),
});
