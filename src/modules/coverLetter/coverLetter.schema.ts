import { z } from 'zod';

// TipTap documents are deeply nested JSON. We accept any JSON object for
// contentJson; the frontend is responsible for producing valid TipTap JSON.
const tiptapDoc = z
  .record(z.string(), z.unknown())
  .or(z.array(z.unknown()));

export const coverLetterStatusEnum = z.enum(['DRAFT', 'GENERATED', 'EXPORTED']);

export const listCoverLettersSchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
    search: z.string().max(120).optional(),
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const createCoverLetterSchema = z.object({
  body: z.object({
    resumeId: z.string().min(1),
    title: z.string().min(1).max(160),
    targetJobTitle: z.string().max(160).optional(),
    targetCompany: z.string().max(160).optional(),
    contentJson: tiptapDoc.optional(),
    contentText: z.string().max(20000).optional(),
  }),
});

export const updateCoverLetterSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(160).optional(),
    targetJobTitle: z.string().max(160).nullable().optional(),
    targetCompany: z.string().max(160).nullable().optional(),
    status: coverLetterStatusEnum.optional(),
    contentJson: tiptapDoc.optional(),
    contentText: z.string().max(20000).optional(),
  }),
  params: z.object({ id: z.string().min(1) }),
});

export const regenerateCoverLetterSchema = z.object({
  body: z.object({
    jobDescription: z.string().min(20).max(20000),
    targetJobTitle: z.string().max(160).optional(),
    targetCompany: z.string().max(160).optional(),
    // When true, prior contentJson is appended to previousVersions before
    // overwrite. Default true.
    preservePrior: z.boolean().optional(),
  }),
  params: z.object({ id: z.string().min(1) }),
});

export type ListCoverLettersInput = z.infer<typeof listCoverLettersSchema>['query'];
export type CreateCoverLetterInput = z.infer<typeof createCoverLetterSchema>['body'];
export type UpdateCoverLetterInput = z.infer<typeof updateCoverLetterSchema>['body'];
export type RegenerateCoverLetterInput = z.infer<typeof regenerateCoverLetterSchema>['body'];