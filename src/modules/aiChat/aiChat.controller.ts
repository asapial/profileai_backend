import type { Request, Response } from "express";
import status from "http-status";
import { envVars } from "../../config/env";
import AppError from "../../errorHelpers/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { cancelPendingAction, confirmPendingAction } from "./aiChat.actions";
import { resolveAiChatActor } from "./aiChat.actor";
import { getAiChatFlags } from "./aiChat.flags";
import { enforceAiChatRateLimit } from "./aiChat.rateLimit";
import { closeConversation, getConversationHistory } from "./aiChat.repository";
import type { AiChatRequestBody, ConfirmActionBody, FeedbackBody } from "./aiChat.schemas";
import * as service from "./aiChat.service";
import { emitAiChatEvent } from "./aiChat.telemetry";

export const verifyChatOrigin = (req: Request): void => {
  const origin = req.headers.origin;
  if (!origin) return;
  const allowed = new Set([envVars.FRONTEND_URL, "http://localhost:3000"].filter(Boolean));
  if (!allowed.has(origin) && !/^https:\/\/[^/]+\.vercel\.app$/.test(origin)) {
    throw new AppError(status.FORBIDDEN, "Request origin is not allowed.", "PERMISSION_DENIED");
  }
};

export const config = catchAsync(async (req, res) => {
  const actor = await resolveAiChatActor(req, res);
  const flags = await getAiChatFlags(actor.role);
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: "AI chat configuration retrieved.",
    data: {
      enabled: flags.enabled,
      role: actor.role,
      toolsEnabled: flags.toolsEnabled,
      title: actor.role === "ADMIN" ? "Admin Copilot" : actor.role === "USER" ? "Career Assistant" : "ProFile Assistant",
    },
  });
});

export const sendMessage = catchAsync(async (req, res) => {
  verifyChatOrigin(req);
  const actor = await resolveAiChatActor(req, res);
  const body = req.body as AiChatRequestBody;
  await enforceAiChatRateLimit(req, actor, Boolean(body.pageContext.resourceId));
  const cancellation = new AbortController();
  const abortOnDisconnect = () => {
    if (!res.writableEnded) cancellation.abort();
  };
  res.once("close", abortOnDisconnect);
  try {
    const data = await service.chat(actor, body, cancellation.signal);
    sendResponse(res, { status: status.OK, success: true, message: "Assistant response generated.", data });
  } catch (error) {
    emitAiChatEvent("ai_chat_response_failed", {
      role: actor.role,
      route: body.pageContext.route,
      errorCode: error instanceof AppError ? (error.code ?? "UNKNOWN") : "UNKNOWN",
    });
    throw error;
  } finally {
    res.off("close", abortOnDisconnect);
  }
});

export const history = catchAsync(async (req, res) => {
  const actor = await resolveAiChatActor(req, res);
  const data = await getConversationHistory(actor, String(req.params.conversationId));
  sendResponse(res, { status: status.OK, success: true, message: "Conversation retrieved.", data });
});

export const clear = catchAsync(async (req, res) => {
  verifyChatOrigin(req);
  const actor = await resolveAiChatActor(req, res);
  const data = await closeConversation(actor, String(req.params.conversationId));
  sendResponse(res, { status: status.OK, success: true, message: "Conversation cleared.", data });
});

export const feedback = catchAsync(async (req, res) => {
  verifyChatOrigin(req);
  const actor = await resolveAiChatActor(req, res);
  const body = req.body as FeedbackBody;
  const data = await service.saveFeedback(actor, {
    messageId: body.messageId,
    rating: body.rating,
    ...(body.comment !== undefined ? { comment: body.comment } : {}),
  });
  sendResponse(res, { status: status.OK, success: true, message: "Feedback recorded.", data: { id: data.id } });
});

export const confirmAction = catchAsync(async (req, res) => {
  verifyChatOrigin(req);
  const actor = await resolveAiChatActor(req, res);
  const flags = await getAiChatFlags(actor.role);
  if (!flags.enabled || !flags.writesEnabled) throw new AppError(status.SERVICE_UNAVAILABLE, "Chat actions are disabled.", "AI_CHAT_DISABLED");
  await enforceAiChatRateLimit(req, actor, true);
  const data = await confirmPendingAction(actor, (req.body as ConfirmActionBody).confirmationToken);
  emitAiChatEvent("ai_chat_action_confirmed", { role: actor.role, actionType: data.actionType });
  sendResponse(res, { status: status.CREATED, success: true, message: "Confirmed action completed.", data });
});

export const cancelAction = catchAsync(async (req, res) => {
  verifyChatOrigin(req);
  const actor = await resolveAiChatActor(req, res);
  const data = await cancelPendingAction(actor, String(req.body.confirmationToken));
  sendResponse(res, { status: status.OK, success: true, message: "Proposed action cancelled.", data });
});
