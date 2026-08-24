import type { AiChatResponse, PageContext, ResourceType } from "./aiChat.schemas";

export type ChatRole = "VISITOR" | "USER" | "ADMIN";

export type AiChatActor = {
  role: ChatRole;
  userId?: string;
  visitorSessionId?: string;
  email?: string;
  adminPermissions: string[];
  twoFactorVerified: boolean;
};

export type SafeResourceContext = {
  type: ResourceType;
  title: string;
  data: Record<string, unknown>;
};

export type HelpContext = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
};

export type ResolvedChatContext = {
  actor: AiChatActor;
  page: PageContext;
  routePurpose: string;
  resource?: SafeResourceContext;
  helpArticles: HelpContext[];
  account?: Record<string, unknown>;
  availableTools: SafeAiToolDefinition[];
};

export type SafeAiToolDefinition = {
  name: string;
  description: string;
  operation: "READ" | "WRITE";
  permittedRoles: ChatRole[];
  requiredPermission?: string;
  confirmationRequired: boolean;
};

export type ChatServiceResult = AiChatResponse & {
  conversationId: string;
  messageId: string;
  role: ChatRole;
  usage?: {
    used: number;
    limit: number;
    remaining: number;
    resetAt: string;
  };
};
