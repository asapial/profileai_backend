import { prisma } from "../../lib/prisma";
import type { ChatRole } from "./aiChat.types";

type FlagData = { enabled?: unknown; rolloutPercent?: unknown };

const enabled = (data: unknown): boolean => {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const flag = data as FlagData;
  return flag.enabled === true && (typeof flag.rolloutPercent !== "number" || flag.rolloutPercent > 0);
};

export const getAiChatFlags = async (role: ChatRole) => {
  const keys = [
    "ai_chat_enabled",
    `ai_chat_${role.toLowerCase()}s_enabled`,
    "ai_chat_tools_enabled",
    "ai_chat_write_actions_enabled",
  ];
  const rows = await prisma.adminResource.findMany({
    where: { type: "FEATURE_FLAG", key: { in: keys } },
    select: { key: true, data: true },
  });
  const values = new Map(rows.map((row) => [row.key, enabled(row.data)]));
  const roleKey = `ai_chat_${role.toLowerCase()}s_enabled`;
  return {
    enabled: values.get("ai_chat_enabled") === true && (values.has(roleKey) ? values.get(roleKey) === true : true),
    toolsEnabled: values.get("ai_chat_tools_enabled") === true,
    writesEnabled: values.get("ai_chat_write_actions_enabled") === true,
  };
};
