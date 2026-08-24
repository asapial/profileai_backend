import { z } from "zod";

export const ResourceTypeSchema = z.enum([
  "none",
  "resume",
  "cover_letter",
  "application",
  "invoice",
  "support_ticket",
  "user",
  "template",
  "report",
]);

export const PageContextSchema = z.object({
  route: z.string().trim().min(1).max(300),
  resourceType: ResourceTypeSchema.default("none"),
  resourceId: z.string().trim().min(1).max(150).optional(),
  selectedSection: z.string().trim().min(1).max(150).optional(),
});

export const AiChatRequestBodySchema = z.object({
  conversationId: z.uuid().optional(),
  message: z.string().trim().min(1).max(6000),
  pageContext: PageContextSchema,
  clientRequestId: z.uuid(),
});

export const AiChatRequestSchema = z.object({ body: AiChatRequestBodySchema });

const SuggestedActionSchema = z.object({
  id: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(160),
  type: z.enum([
    "NAVIGATE",
    "SEND_MESSAGE",
    "OPEN_HELP_ARTICLE",
    "PREVIEW_CHANGE",
    "REQUEST_CONFIRMATION",
    "OPEN_SUPPORT_TICKET",
  ]),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const AiChatResponseSchema = z.object({
  answer: z.string().trim().min(1).max(12000),
  intent: z.enum([
    "GENERAL_HELP",
    "NAVIGATION",
    "RESUME_ASSISTANCE",
    "ATS_EXPLANATION",
    "JD_ANALYSIS",
    "COVER_LETTER_ASSISTANCE",
    "APPLICATION_ASSISTANCE",
    "BILLING_EXPLANATION",
    "SUPPORT_ESCALATION",
    "ADMIN_ANALYSIS",
    "ACTION_PROPOSAL",
    "UNSUPPORTED",
  ]),
  suggestedActions: z.array(SuggestedActionSchema).max(5).default([]),
  sources: z.array(z.object({
    type: z.enum(["HELP_ARTICLE", "CURRENT_PAGE", "ACCOUNT_DATA"]),
    id: z.string().max(200).optional(),
    title: z.string().trim().min(1).max(240),
    targetUrl: z.string().max(500).optional(),
  })).max(8).default([]),
  escalation: z.object({
    recommended: z.boolean(),
    reason: z.string().max(1000).optional(),
    category: z.enum(["account", "resume", "billing", "export", "ai", "security", "other"]).optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  }).default({ recommended: false }),
  pendingAction: z.object({
    required: z.boolean(),
    actionType: z.string().max(100).optional(),
    confirmationToken: z.string().max(500).optional(),
    summary: z.string().max(2000).optional(),
    warning: z.string().max(1000).optional(),
  }).default({ required: false }),
  ui: z.object({
    showUsageWarning: z.boolean().default(false),
    showHumanSupportButton: z.boolean().default(false),
    preserveComposerText: z.boolean().default(false),
  }).default({
    showUsageWarning: false,
    showHumanSupportButton: false,
    preserveComposerText: false,
  }),
});

export const ConfirmActionBodySchema = z.object({
  confirmationToken: z.string().trim().min(20).max(500),
  clientRequestId: z.uuid(),
});
export const ConfirmActionRequestSchema = z.object({ body: ConfirmActionBodySchema });

export const CancelActionBodySchema = z.object({
  confirmationToken: z.string().trim().min(20).max(500),
});
export const CancelActionRequestSchema = z.object({ body: CancelActionBodySchema });

export const FeedbackBodySchema = z.object({
  messageId: z.uuid(),
  rating: z.union([z.literal(-1), z.literal(1)]),
  comment: z.string().trim().max(1000).optional(),
});
export const FeedbackRequestSchema = z.object({ body: FeedbackBodySchema });

export const ConversationParamsSchema = z.object({
  params: z.object({ conversationId: z.uuid() }),
});

export type AiChatRequestBody = z.infer<typeof AiChatRequestBodySchema>;
export type AiChatResponse = z.infer<typeof AiChatResponseSchema>;
export type PageContext = z.infer<typeof PageContextSchema>;
export type ResourceType = z.infer<typeof ResourceTypeSchema>;
export type ConfirmActionBody = z.infer<typeof ConfirmActionBodySchema>;
export type FeedbackBody = z.infer<typeof FeedbackBodySchema>;
