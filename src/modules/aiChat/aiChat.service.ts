import status from "http-status";
import { Prisma } from "../../../prisma/generated/prisma/client";
import AppError from "../../errorHelpers/AppError";
import { prisma } from "../../lib/prisma";
import { recordAiUsage } from "../../utils/aiUsage";
import { proposeSupportTicket } from "./aiChat.actions";
import { resolveChatContext } from "./aiChat.context";
import { getAiChatFlags } from "./aiChat.flags";
import { sanitizeModelResponse } from "./aiChat.guardrails";
import { buildAiChatSystemPrompt, buildAiChatUserMessage } from "./aiChat.prompt";
import { generateChatResponse } from "./aiChat.provider";
import {
  ensureUserMessage,
  findIdempotentResponse,
  getOrCreateConversation,
  recentMessages,
  saveAssistantMessage,
  updateConversationSummary,
} from "./aiChat.repository";
import { AiChatResponseSchema, type AiChatRequestBody, type AiChatResponse } from "./aiChat.schemas";
import type { AiChatActor, ChatServiceResult, ResolvedChatContext } from "./aiChat.types";
import { emitAiChatEvent } from "./aiChat.telemetry";

const usageFor = async (actor: AiChatActor) => {
  if (actor.role !== "USER" || !actor.userId) return null;
  const limits = await prisma.userLimit.findUnique({ where: { userId: actor.userId } });
  if (!limits) throw new AppError(status.FORBIDDEN, "AI usage is not configured for this account.", "AI_USAGE_LIMIT_REACHED");
  if (limits.apiUsed >= limits.apiLimit) throw new AppError(status.TOO_MANY_REQUESTS, "You have reached your AI usage limit for this period.", "AI_USAGE_LIMIT_REACHED");
  return limits;
};

const chargeUsage = async (actor: AiChatActor) => {
  if (!actor.userId) return null;
  if (actor.role === "USER") {
    const charged = await prisma.userLimit.updateMany({
      where: { userId: actor.userId, apiUsed: { lt: prisma.userLimit.fields.apiLimit } },
      data: { apiUsed: { increment: 1 } },
    });
    if (charged.count !== 1) throw new AppError(status.TOO_MANY_REQUESTS, "You have reached your AI usage limit for this period.", "AI_USAGE_LIMIT_REACHED");
  }
  await recordAiUsage(actor.userId, "chat_support");
  return actor.role === "USER" ? prisma.userLimit.findUnique({ where: { userId: actor.userId } }) : null;
};

const allowedSources = (response: AiChatResponse, context: ResolvedChatContext): AiChatResponse["sources"] => {
  const helpIds = new Set(context.helpArticles.map((article) => article.id));
  const filtered = response.sources.filter((source) => {
    if (source.type === "HELP_ARTICLE") return Boolean(source.id && helpIds.has(source.id));
    if (source.type === "CURRENT_PAGE") return true;
    return source.type === "ACCOUNT_DATA" && context.actor.role !== "VISITOR";
  });
  for (const article of context.helpArticles) {
    if (filtered.length >= 8) break;
    if (!filtered.some((source) => source.type === "HELP_ARTICLE" && source.id === article.id)) {
      filtered.push({ type: "HELP_ARTICLE", id: article.id, title: article.title, targetUrl: "/help" });
    }
  }
  return filtered.slice(0, 8);
};

const duplicateResult = (actor: AiChatActor, duplicate: NonNullable<Awaited<ReturnType<typeof findIdempotentResponse>>>): ChatServiceResult | null => {
  if (!duplicate.reply?.structuredData) return null;
  const parsed = AiChatResponseSchema.safeParse(duplicate.reply.structuredData);
  if (!parsed.success) return null;
  return { ...parsed.data, conversationId: duplicate.conversation.id, messageId: duplicate.reply.id, role: actor.role };
};

export const chat = async (actor: AiChatActor, body: AiChatRequestBody, signal?: AbortSignal): Promise<ChatServiceResult> => {
  const flags = await getAiChatFlags(actor.role);
  if (!flags.enabled) throw new AppError(status.SERVICE_UNAVAILABLE, "The assistant is currently disabled.", "AI_CHAT_DISABLED");

  const duplicate = await findIdempotentResponse(actor, body.clientRequestId);
  const prior = duplicate ? duplicateResult(actor, duplicate) : null;
  if (prior) return prior;

  const usage = await usageFor(actor);
  const context = await resolveChatContext({ actor, page: body.pageContext, message: body.message, toolsEnabled: flags.toolsEnabled, writesEnabled: flags.writesEnabled });
  const conversation = await getOrCreateConversation(actor, duplicate?.conversation.id ?? body.conversationId, body.pageContext.route, body.message);
  const requestMessage = await ensureUserMessage({ conversationId: conversation.id, clientRequestId: body.clientRequestId, content: body.message, page: body.pageContext });
  const history = await recentMessages(conversation.id, requestMessage.id);
  emitAiChatEvent("ai_chat_message_submitted", { role: actor.role, route: body.pageContext.route, conversationId: conversation.id });

  const provider = await generateChatResponse({
    systemPrompt: buildAiChatSystemPrompt(context),
    userMessage: buildAiChatUserMessage(body.message),
    conversationMessages: history,
    ...(signal ? { signal } : {}),
  });
  let response = sanitizeModelResponse(provider.response);
  response = { ...response, sources: allowedSources(response, context) };

  const explicitSupportRequest = /\b(?:contact|open|create|raise|talk to|speak to)\b.{0,30}\b(?:support|human|agent|ticket)\b|\bsupport ticket\b/i.test(body.message);
  if ((response.escalation.recommended || explicitSupportRequest) && actor.role === "USER" && flags.writesEnabled) {
    const pendingAction = await proposeSupportTicket({
      actor,
      conversationId: conversation.id,
      message: body.message,
      answer: response.answer,
      page: body.pageContext,
      ...(response.escalation.category ? { category: response.escalation.category } : {}),
      ...(response.escalation.priority ? { priority: response.escalation.priority } : {}),
    });
    if (pendingAction) response = { ...response, pendingAction, ui: { ...response.ui, showHumanSupportButton: true } };
  }

  const charged = await chargeUsage(actor);
  const remaining = charged ? Math.max(0, charged.apiLimit - charged.apiUsed) : null;
  if (remaining !== null && remaining <= 5) response = { ...response, ui: { ...response.ui, showUsageWarning: true } };
  const assistant = await saveAssistantMessage({ conversationId: conversation.id, requestMessageId: requestMessage.id, response, model: provider.model, latencyMs: provider.latencyMs, page: body.pageContext });
  void updateConversationSummary(conversation.id).catch(() => undefined);
  emitAiChatEvent("ai_chat_response_success", { role: actor.role, route: body.pageContext.route, intent: response.intent, latencyMs: provider.latencyMs, conversationId: conversation.id });

  return {
    ...response,
    conversationId: conversation.id,
    messageId: assistant.id,
    role: actor.role,
    ...(charged ? { usage: { used: charged.apiUsed, limit: charged.apiLimit, remaining: charged.apiLimit - charged.apiUsed, resetAt: charged.resetAt.toISOString() } } : usage && actor.role === "USER" ? { usage: { used: usage.apiUsed, limit: usage.apiLimit, remaining: usage.apiLimit - usage.apiUsed, resetAt: usage.resetAt.toISOString() } } : {}),
  };
};

export const saveFeedback = async (actor: AiChatActor, input: { messageId: string; rating: -1 | 1; comment?: string }) => {
  const message = await prisma.aiMessage.findUnique({ where: { id: input.messageId }, include: { conversation: true } });
  if (!message || (actor.userId ? message.conversation.userId !== actor.userId : message.conversation.visitorSessionId !== actor.visitorSessionId)) {
    throw new AppError(status.NOT_FOUND, "Chat message not found.", "RESOURCE_NOT_FOUND");
  }
  const feedback = await prisma.aiFeedback.upsert({
    where: { messageId: input.messageId },
    update: { rating: input.rating, ...(input.comment !== undefined ? { comment: input.comment } : {}) },
    create: { messageId: input.messageId, rating: input.rating, ...(actor.userId ? { userId: actor.userId } : {}), ...(input.comment !== undefined ? { comment: input.comment } : {}) },
  });
  emitAiChatEvent("ai_chat_feedback_submitted", { role: actor.role, messageId: input.messageId, rating: input.rating });
  return feedback;
};
