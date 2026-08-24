import type { Request, Response } from "express";
import status from "http-status";
import { randomUUID } from "node:crypto";
import { envVars } from "../../config/env";
import AppError from "../../errorHelpers/AppError";
import { prisma } from "../../lib/prisma";
import { cookieUtils } from "../../utils/cookie";
import { jwtUtils } from "../../utils/jwt";
import type { AiChatActor } from "./aiChat.types";

export const VISITOR_COOKIE = "profileaiVisitorSession";

const bearerToken = (req: Request): string | undefined => {
  const value = req.headers.authorization;
  return value?.startsWith("Bearer ") ? value.slice(7) : undefined;
};

export const ensureVisitorSession = (req: Request, res: Response): string => {
  const existing = req.cookies?.[VISITOR_COOKIE];
  const sessionId = typeof existing === "string" && /^[0-9a-f-]{36}$/i.test(existing)
    ? existing
    : randomUUID();
  if (sessionId !== existing) {
    res.cookie(VISITOR_COOKIE, sessionId, {
      httpOnly: true,
      secure: envVars.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/",
    });
  }
  return sessionId;
};

export const resolveAiChatActor = async (
  req: Request,
  res: Response,
): Promise<AiChatActor> => {
  const token = cookieUtils.getCookie(req, "accessToken") ?? bearerToken(req);
  if (!token) {
    return {
      role: "VISITOR",
      visitorSessionId: ensureVisitorSession(req, res),
      adminPermissions: [],
      twoFactorVerified: false,
    };
  }

  const verified = jwtUtils.vefifyToken(token, envVars.ACCESS_TOKEN_SECRET);
  const userId = verified.success && verified.data && typeof verified.data === "object"
    ? (verified.data as { userId?: unknown }).userId
    : undefined;
  if (typeof userId !== "string") {
    throw new AppError(status.UNAUTHORIZED, "Your session is invalid or expired.", "AUTHENTICATION_REQUIRED");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      twoFactorEnabled: true,
      adminProfile: { select: { permissions: true } },
    },
  });
  if (!user || !user.isActive) {
    throw new AppError(status.UNAUTHORIZED, "Your account is unavailable.", "AUTHENTICATION_REQUIRED");
  }

  let twoFactorVerified = false;
  if (user.role === "ADMIN" && user.twoFactorEnabled) {
    const session = await prisma.session.findUnique({
      where: { token },
      select: { twoFactorVerifiedAt: true },
    });
    twoFactorVerified = Boolean(session?.twoFactorVerifiedAt);
  }

  return {
    role: user.role,
    userId: user.id,
    email: user.email,
    adminPermissions: user.role === "ADMIN" ? (user.adminProfile?.permissions ?? []) : [],
    twoFactorVerified,
  };
};
