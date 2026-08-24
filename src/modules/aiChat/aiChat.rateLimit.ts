import status from "http-status";
import type { Request } from "express";
import AppError from "../../errorHelpers/AppError";
import { redis } from "../../lib/redis";
import { hashValue } from "./aiChat.guardrails";
import type { AiChatActor } from "./aiChat.types";

const local = new Map<string, { count: number; expiresAt: number }>();
const WINDOW_SECONDS = 5 * 60;

const actorLimit = (actor: AiChatActor, contextual: boolean): number => {
  const base = actor.role === "VISITOR" ? 12 : actor.role === "USER" ? 30 : 40;
  return contextual ? Math.max(8, base - 5) : base;
};

const getIp = (req: Request): string => {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  return raw?.trim() || req.ip || "unknown";
};

export const enforceAiChatRateLimit = async (
  req: Request,
  actor: AiChatActor,
  contextual: boolean,
): Promise<void> => {
  const identity = actor.userId ?? actor.visitorSessionId ?? "anonymous";
  const bucket = Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
  const key = `ai-chat:rate:${hashValue(`${identity}:${getIp(req)}`).slice(0, 32)}:${bucket}`;
  const limit = actorLimit(actor, contextual);
  let count: number;
  try {
    const reply = await redis.multi().incr(key).expire(key, WINDOW_SECONDS + 5).exec();
    count = Number(reply?.[0]?.[1] ?? 0);
  } catch {
    const now = Date.now();
    const current = local.get(key);
    const next = !current || current.expiresAt <= now
      ? { count: 1, expiresAt: now + WINDOW_SECONDS * 1000 }
      : { ...current, count: current.count + 1 };
    local.set(key, next);
    count = next.count;
  }
  if (count > limit) {
    throw new AppError(status.TOO_MANY_REQUESTS, "Too many chat requests. Please wait a few minutes.", "CHAT_RATE_LIMITED");
  }
};
