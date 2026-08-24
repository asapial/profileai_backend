export const emitAiChatEvent = (event: string, metadata: Record<string, unknown>): void => {
  console.info(JSON.stringify({ event, feature: "chat_support", ...metadata }));
};
