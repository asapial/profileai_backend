import status from "http-status";
import { Prisma } from "../../../prisma/generated/prisma/client";
import AppError from "../../errorHelpers/AppError";
import { prisma } from "../../lib/prisma";
import type { AiChatResponse, PageContext } from "./aiChat.schemas";
import type { AiChatActor } from "./aiChat.types";

type ConversationOwner = { userId: string | null; visitorSessionId: string | null };

export const actorOwnsConversation = (actor: AiChatActor, conversation: ConversationOwner): boolean =>
  actor.userId ? conversation.userId === actor.userId : Boolean(actor.visitorSessionId && conversation.visitorSessionId === actor.visitorSessionId);

export const assertConversationAccess = (actor: AiChatActor, conversation: ConversationOwner): void => {
  if (!actorOwnsConversation(actor, conversation)) {
    throw new AppError(status.FORBIDDEN, "This conversation belongs to another actor.", "PERMISSION_DENIED");
  }
};

export const findIdempotentResponse = async (
  actor: AiChatActor,
  clientRequestId: string,
) => {
  const request = await prisma.aiMessage.findUnique({
    where: { clientRequestId },
    include: { conversation: { select: { id: true, userId: true, visitorSessionId: true } } },
  });
  if (!request) return null;
  assertConversationAccess(actor, request.conversation);
  const reply = await prisma.aiMessage.findUnique({ where: { replyToMessageId: request.id } });
  if (!reply?.structuredData) return { conversation: request.conversation, request, reply: null };
  return { conversation: request.conversation, request, reply };
};

export const getOrCreateConversation = async (
  actor: AiChatActor,
  conversationId: string | undefined,
  route: string,
  firstMessage: string,
) => {
  if (conversationId) {
    const existing = await prisma.aiConversation.findUnique({ where: { id: conversationId } });
    if (!existing || existing.status !== "ACTIVE") throw new AppError(status.NOT_FOUND, "Conversation not found.", "RESOURCE_NOT_FOUND");
    assertConversationAccess(actor, existing);
    return prisma.aiConversation.update({ where: { id: existing.id }, data: { currentRoute: route, role: actor.role } });
  }
  return prisma.aiConversation.create({
    data: {
      role: actor.role,
      title: firstMessage.slice(0, 80),
      currentRoute: route,
      ...(actor.userId ? { userId: actor.userId } : { visitorSessionId: actor.visitorSessionId! }),
    },
  });
};

export const ensureUserMessage = async (input: {
  conversationId: string;
  clientRequestId: string;
  content: string;
  page: PageContext;
}) => {
  const existing = await prisma.aiMessage.findUnique({ where: { clientRequestId: input.clientRequestId } });
  if (existing) return existing;
  return prisma.aiMessage.create({
    data: {
      conversationId: input.conversationId,
      sender: "USER",
      content: input.content,
      clientRequestId: input.clientRequestId,
      route: input.page.route,
      resourceType: input.page.resourceType,
      ...(input.page.resourceId ? { resourceId: input.page.resourceId } : {}),
    },
  });
};

export const recentMessages = async (conversationId: string, excludeId?: string) => {
  const rows = await prisma.aiMessage.findMany({
    where: { conversationId, ...(excludeId ? { id: { not: excludeId } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { sender: true, content: true },
  });
  return rows.reverse().filter((row) => row.sender === "USER" || row.sender === "ASSISTANT").map((row) => ({
    role: row.sender === "USER" ? "user" as const : "assistant" as const,
    content: row.content.slice(0, 3000),
  }));
};

export const saveAssistantMessage = async (input: {
  conversationId: string;
  requestMessageId: string;
  response: AiChatResponse;
  model: string;
  latencyMs: number;
  page: PageContext;
}) => prisma.aiMessage.create({
  data: {
    conversationId: input.conversationId,
    sender: "ASSISTANT",
    content: input.response.answer,
    structuredData: input.response as unknown as Prisma.InputJsonValue,
    replyToMessageId: input.requestMessageId,
    route: input.page.route,
    resourceType: input.page.resourceType,
    ...(input.page.resourceId ? { resourceId: input.page.resourceId } : {}),
    modelName: input.model,
    latencyMs: input.latencyMs,
  },
});

export const updateConversationSummary = async (conversationId: string): Promise<void> => {
  const count = await prisma.aiMessage.count({ where: { conversationId } });
  if (count < 20 || count % 10 !== 0) return;
  const recent = await prisma.aiMessage.findMany({ where: { conversationId }, orderBy: { createdAt: "desc" }, take: 8, select: { sender: true, content: true } });
  const summary = recent.reverse().map((message) => `${message.sender}: ${message.content.slice(0, 240)}`).join("\n").slice(0, 2200);
  await prisma.aiConversation.update({ where: { id: conversationId }, data: { summary } });
};

export const getConversationHistory = async (actor: AiChatActor, conversationId: string) => {
  const conversation = await prisma.aiConversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw new AppError(status.NOT_FOUND, "Conversation not found.", "RESOURCE_NOT_FOUND");
  assertConversationAccess(actor, conversation);
  const messages = await prisma.aiMessage.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" }, take: 100, select: { id: true, sender: true, content: true, structuredData: true, createdAt: true } });
  return { id: conversation.id, title: conversation.title, status: conversation.status, messages };
};

export const closeConversation = async (actor: AiChatActor, conversationId: string) => {
  const conversation = await prisma.aiConversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw new AppError(status.NOT_FOUND, "Conversation not found.", "RESOURCE_NOT_FOUND");
  assertConversationAccess(actor, conversation);
  await prisma.$transaction([
    prisma.aiConversation.update({ where: { id: conversationId }, data: { status: "CLOSED", closedAt: new Date() } }),
    prisma.aiPendingAction.updateMany({ where: { conversationId, status: "PENDING" }, data: { status: "CANCELLED", consumedAt: new Date() } }),
  ]);
  return { closed: true as const };
};
