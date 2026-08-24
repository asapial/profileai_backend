import { createHash } from "node:crypto";
import type { AiChatResponse } from "./aiChat.schemas";

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]"],
  [/\b(?:sk|rk|pk)_[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_API_KEY]"],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_TOKEN]"],
  [/(password|secret|api[_ -]?key|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]"],
  [/\b\d{12,19}\b/g, "[REDACTED_NUMBER]"],
];

export const stripHtml = (value: string): string => value
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

export const redactSecrets = (value: string): string =>
  SECRET_PATTERNS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);

export const minimizeText = (value: unknown, maxLength = 5000): string => {
  const text = redactSecrets(stripHtml(typeof value === "string" ? value : JSON.stringify(value ?? "")));
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}\n[Context truncated by ProFile AI]`;
};

export const wrapUntrusted = (label: string, value: unknown, maxLength = 5000): string => {
  const safeLabel = label.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
  return `<untrusted_${safeLabel}_content>\n${minimizeText(value, maxLength)}\n</untrusted_${safeLabel}_content>`;
};

export const hashValue = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const safeInternalUrl = (value: unknown): string | undefined => {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return undefined;
  if (value.includes("..") || /[\u0000-\u001F]/.test(value)) return undefined;
  return value.slice(0, 500);
};

const sanitizePayload = (value: unknown, depth = 0): unknown => {
  if (depth > 4) return "[Nested content omitted]";
  if (typeof value === "string") return minimizeText(value, 4000);
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitizePayload(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/(password|secret|token|credential|cookie)/i.test(key))
    .slice(0, 40)
    .map(([key, item]) => [key, sanitizePayload(item, depth + 1)]));
};

export const sanitizeModelResponse = (response: AiChatResponse): AiChatResponse => ({
  ...response,
  answer: redactSecrets(stripHtml(response.answer)),
  suggestedActions: response.suggestedActions.slice(0, 5).map((action) => {
    const payload = sanitizePayload(action.payload ?? {}) as Record<string, unknown>;
    if ("route" in payload) {
      const route = safeInternalUrl(payload.route);
      if (route) payload.route = route;
      else delete payload.route;
    }
    if ("targetUrl" in payload) {
      const targetUrl = safeInternalUrl(payload.targetUrl);
      if (targetUrl) payload.targetUrl = targetUrl;
      else delete payload.targetUrl;
    }
    return { ...action, label: stripHtml(action.label), payload };
  }),
  sources: response.sources.slice(0, 8).map((source) => ({
    ...source,
    title: stripHtml(source.title),
    ...(source.targetUrl ? { targetUrl: safeInternalUrl(source.targetUrl) } : {}),
  })).filter((source) => !source.targetUrl || source.targetUrl.startsWith("/")),
  pendingAction: { required: false },
});
