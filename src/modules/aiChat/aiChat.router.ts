import { Router, type RequestHandler } from "express";
import { validateRequest } from "../../middleware/validateRequest";
import AppError from "../../errorHelpers/AppError";
import * as controller from "./aiChat.controller";
import {
  AiChatRequestSchema,
  CancelActionRequestSchema,
  ConfirmActionRequestSchema,
  ConversationParamsSchema,
  FeedbackRequestSchema,
} from "./aiChat.schemas";

const router = Router();

const rejectOversizedMessage: RequestHandler = (req, _res, next) => {
  if (typeof req.body?.message === "string" && req.body.message.length > 6000) {
    next(new AppError(413, "Message must contain at most 6000 characters.", "MESSAGE_TOO_LONG"));
    return;
  }
  next();
};

router.get("/chat/config", controller.config);
router.post("/chat", rejectOversizedMessage, validateRequest(AiChatRequestSchema), controller.sendMessage);
router.post("/chat/feedback", validateRequest(FeedbackRequestSchema), controller.feedback);
router.post("/chat/actions/confirm", validateRequest(ConfirmActionRequestSchema), controller.confirmAction);
router.post("/chat/actions/cancel", validateRequest(CancelActionRequestSchema), controller.cancelAction);
router.get("/chat/:conversationId", validateRequest(ConversationParamsSchema), controller.history);
router.delete("/chat/:conversationId", validateRequest(ConversationParamsSchema), controller.clear);

export const aiChatRouter = router;
