import status from "http-status";
import { randomBytes } from "node:crypto";
import { Prisma } from "../../../prisma/generated/prisma/client";
import AppError from "../../errorHelpers/AppError";
import { prisma } from "../../lib/prisma";
import { tickets } from "../admin/admin.operations.service";
import { hashValue, minimizeText } from "./aiChat.guardrails";
import type { PageContext } from "./aiChat.schemas";
import type { AiChatActor } from "./aiChat.types";
import { emitAiChatEvent } from "./aiChat.telemetry";

type SupportPayload = {
  subject: string;
  category: "account" | "resume" | "billing" | "export" | "ai" | "security" | "other";
  priority: "low" | "medium" | "high" | "urgent";
  description: string;
  context: {
    route?: string;
    resourceType?: string;
    resourceId?: string;
    conversationId?: string;
  };
};

const json = (value: unknown) => value as Prisma.InputJsonValue;

export const proposeSupportTicket = async (input: {
  actor: AiChatActor;
  conversationId: string;
  message: string;
  answer: string;
  page: PageContext;
  category?: SupportPayload["category"];
  priority?: SupportPayload["priority"];
}) => {
  if (!input.actor.userId || input.actor.role !== "USER") return null;
  const token = randomBytes(32).toString("base64url");
  const subjectBase = minimizeText(input.message, 100).replace(/\s+/g, " ");
  const payload: SupportPayload = {
    subject: subjectBase.length > 8 ? subjectBase : "Help requested from ProFile Assistant",
    category: input.category ?? "other",
    priority: input.priority ?? "medium",
    description: minimizeText(`User request: ${input.message}\n\nAssistant summary: ${input.answer}`, 1400),
    context: {
      route: input.page.route,
      resourceType: input.page.resourceType,
      ...(input.page.resourceId ? { resourceId: input.page.resourceId } : {}),
      conversationId: input.conversationId,
    },
  };
  await prisma.aiPendingAction.create({
    data: {
      conversationId: input.conversationId,
      actorUserId: input.actor.userId,
      actionType: "CREATE_SUPPORT_TICKET",
      confirmationTokenHash: hashValue(token),
      payload: json(payload),
      stateFingerprint: hashValue(JSON.stringify(payload)),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
  await prisma.aiToolExecution.create({
    data: {
      conversationId: input.conversationId,
      toolName: "create_support_ticket",
      operation: "WRITE",
      status: "PROPOSED",
      input: json({ category: payload.category, priority: payload.priority, route: input.page.route }),
    },
  });
  emitAiChatEvent("ai_chat_tool_requested", { role: input.actor.role, conversationId: input.conversationId, toolName: "create_support_ticket", operationType: "WRITE" });
  emitAiChatEvent("ai_chat_support_escalation_started", { role: input.actor.role, conversationId: input.conversationId, category: payload.category });
  return {
    required: true as const,
    actionType: "CREATE_SUPPORT_TICKET",
    confirmationToken: token,
    summary: `Subject: ${payload.subject}\nCategory: ${payload.category}\nPriority: ${payload.priority}\n\nDescription:\n${payload.description}`,
    warning: "A support agent will receive the reviewed summary. The full chat is not attached.",
  };
};

const pendingByToken = async (actor: AiChatActor, token: string) => {
  if (!actor.userId || actor.role !== "USER") {
    throw new AppError(status.FORBIDDEN, "This action requires an authenticated user.", "ROLE_NOT_ALLOWED");
  }
  const row = await prisma.aiPendingAction.findUnique({ where: { confirmationTokenHash: hashValue(token) } });
  if (!row || row.actorUserId !== actor.userId) {
    throw new AppError(status.NOT_FOUND, "Confirmation is invalid or expired.", "ACTION_CONFIRMATION_EXPIRED");
  }
  if (row.status !== "PENDING") {
    throw new AppError(status.CONFLICT, "This confirmation has already been used.", "ACTION_STATE_CHANGED");
  }
  if (row.expiresAt <= new Date()) {
    await prisma.aiPendingAction.update({ where: { id: row.id }, data: { status: "EXPIRED" } });
    throw new AppError(status.GONE, "This confirmation has expired.", "ACTION_CONFIRMATION_EXPIRED");
  }
  return row;
};

export const confirmPendingAction = async (actor: AiChatActor, token: string) => {
  const pending = await pendingByToken(actor, token);
  if (pending.actionType !== "CREATE_SUPPORT_TICKET") {
    throw new AppError(status.FORBIDDEN, "This action is not registered.", "TOOL_NOT_ALLOWED");
  }
  const payload = pending.payload as unknown as SupportPayload;
  const claimed = await prisma.aiPendingAction.updateMany({
    where: { id: pending.id, status: "PENDING", expiresAt: { gt: new Date() } },
    data: { status: "CONFIRMED", consumedAt: new Date() },
  });
  if (claimed.count !== 1) throw new AppError(status.CONFLICT, "The action state changed.", "ACTION_STATE_CHANGED");
  try {
    const ticket = await tickets.createFromUser({
      userId: actor.userId!,
      subject: payload.subject,
      category: payload.category.toUpperCase(),
      priority: payload.priority === "medium" ? "NORMAL" : payload.priority.toUpperCase(),
      description: payload.description,
      context: payload.context,
    });
    await prisma.$transaction([
      prisma.aiToolExecution.create({ data: { conversationId: pending.conversationId, toolName: "create_support_ticket", operation: "WRITE", status: "SUCCEEDED", input: json({ pendingActionId: pending.id }), output: json({ ticketId: ticket.id }), completedAt: new Date() } }),
      prisma.auditLog.create({ data: { actorId: actor.userId!, actorEmail: actor.email ?? null, action: "ai_chat.support_ticket_created", entityType: "SupportTicket", entityId: ticket.id, metadata: json({ conversationId: pending.conversationId, pendingActionId: pending.id }) } }),
    ]);
    emitAiChatEvent("ai_chat_tool_completed", { role: actor.role, conversationId: pending.conversationId, toolName: "create_support_ticket", operationType: "WRITE", status: "SUCCEEDED" });
    emitAiChatEvent("ai_chat_support_ticket_created", { role: actor.role, conversationId: pending.conversationId, ticketId: ticket.id });
    return { success: true as const, actionType: pending.actionType, ticket: { id: ticket.id, subject: ticket.subject, status: ticket.status } };
  } catch (error) {
    await prisma.aiToolExecution.create({ data: { conversationId: pending.conversationId, toolName: "create_support_ticket", operation: "WRITE", status: "FAILED", input: json({ pendingActionId: pending.id }), errorCode: "SUPPORT_ESCALATION_FAILED", completedAt: new Date() } }).catch(() => undefined);
    emitAiChatEvent("ai_chat_tool_failed", { role: actor.role, conversationId: pending.conversationId, toolName: "create_support_ticket", operationType: "WRITE", status: "FAILED", errorCode: "SUPPORT_ESCALATION_FAILED" });
    throw new AppError(status.INTERNAL_SERVER_ERROR, "The support ticket could not be created.", "SUPPORT_ESCALATION_FAILED");
  }
};

export const cancelPendingAction = async (actor: AiChatActor, token: string) => {
  const pending = await pendingByToken(actor, token);
  await prisma.$transaction([
    prisma.aiPendingAction.update({ where: { id: pending.id }, data: { status: "CANCELLED", consumedAt: new Date() } }),
    prisma.aiToolExecution.create({ data: { conversationId: pending.conversationId, toolName: pending.actionType.toLowerCase(), operation: "WRITE", status: "CANCELLED", input: json({ pendingActionId: pending.id }), completedAt: new Date() } }),
  ]);
  emitAiChatEvent("ai_chat_action_cancelled", { role: actor.role, conversationId: pending.conversationId, actionType: pending.actionType });
  return { cancelled: true as const };
};
