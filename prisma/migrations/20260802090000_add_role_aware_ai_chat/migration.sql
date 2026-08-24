CREATE TYPE "AiConversationStatus" AS ENUM ('ACTIVE', 'CLOSED');
CREATE TYPE "AiMessageSender" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');
CREATE TYPE "AiToolOperation" AS ENUM ('READ', 'WRITE');
CREATE TYPE "AiToolExecutionStatus" AS ENUM ('PROPOSED', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "AiPendingActionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

CREATE TABLE "ai_conversation" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "visitorSessionId" TEXT,
  "role" TEXT NOT NULL,
  "title" TEXT,
  "currentRoute" TEXT,
  "status" "AiConversationStatus" NOT NULL DEFAULT 'ACTIVE',
  "summary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "ai_conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_message" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "sender" "AiMessageSender" NOT NULL,
  "content" TEXT NOT NULL,
  "structuredData" JSONB,
  "route" TEXT,
  "resourceType" TEXT,
  "resourceId" TEXT,
  "clientRequestId" TEXT,
  "replyToMessageId" TEXT,
  "modelName" TEXT,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "latencyMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_tool_execution" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "toolName" TEXT NOT NULL,
  "operation" "AiToolOperation" NOT NULL,
  "status" "AiToolExecutionStatus" NOT NULL,
  "input" JSONB,
  "output" JSONB,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "ai_tool_execution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_pending_action" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "actionType" TEXT NOT NULL,
  "confirmationTokenHash" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "stateFingerprint" TEXT,
  "status" "AiPendingActionStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_pending_action_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_feedback" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "userId" TEXT,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_message_clientRequestId_key" ON "ai_message"("clientRequestId");
CREATE UNIQUE INDEX "ai_message_replyToMessageId_key" ON "ai_message"("replyToMessageId");
CREATE INDEX "ai_message_conversationId_createdAt_idx" ON "ai_message"("conversationId", "createdAt");
CREATE INDEX "ai_conversation_userId_updatedAt_idx" ON "ai_conversation"("userId", "updatedAt");
CREATE INDEX "ai_conversation_visitorSessionId_updatedAt_idx" ON "ai_conversation"("visitorSessionId", "updatedAt");
CREATE INDEX "ai_tool_execution_conversationId_createdAt_idx" ON "ai_tool_execution"("conversationId", "createdAt");
CREATE INDEX "ai_tool_execution_toolName_status_createdAt_idx" ON "ai_tool_execution"("toolName", "status", "createdAt");
CREATE UNIQUE INDEX "ai_pending_action_confirmationTokenHash_key" ON "ai_pending_action"("confirmationTokenHash");
CREATE INDEX "ai_pending_action_actorUserId_status_expiresAt_idx" ON "ai_pending_action"("actorUserId", "status", "expiresAt");
CREATE UNIQUE INDEX "ai_feedback_messageId_key" ON "ai_feedback"("messageId");
CREATE INDEX "ai_feedback_createdAt_idx" ON "ai_feedback"("createdAt");

ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_message" ADD CONSTRAINT "ai_message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_tool_execution" ADD CONSTRAINT "ai_tool_execution_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_pending_action" ADD CONSTRAINT "ai_pending_action_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ai_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "admin_resource" ("id", "type", "key", "data", "createdAt", "updatedAt")
VALUES
  ('ai-chat-enabled', 'FEATURE_FLAG', 'ai_chat_enabled', '{"key":"ai_chat_enabled","name":"AI contextual assistant","description":"Enable the role-aware support chatbot.","enabled":true,"rolloutPercent":100,"environment":"PRODUCTION","targeting":{"planIds":[],"regions":[],"userIds":[]}}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ai-chat-tools-enabled', 'FEATURE_FLAG', 'ai_chat_tools_enabled', '{"key":"ai_chat_tools_enabled","name":"AI chat contextual tools","description":"Allow backend-owned read tools in AI chat.","enabled":true,"rolloutPercent":100,"environment":"PRODUCTION","targeting":{"planIds":[],"regions":[],"userIds":[]}}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ai-chat-write-actions-enabled', 'FEATURE_FLAG', 'ai_chat_write_actions_enabled', '{"key":"ai_chat_write_actions_enabled","name":"AI chat confirmed writes","description":"Allow explicitly confirmed low-risk chat actions.","enabled":true,"rolloutPercent":100,"environment":"PRODUCTION","targeting":{"planIds":[],"regions":[],"userIds":[]}}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("type", "key") DO NOTHING;
