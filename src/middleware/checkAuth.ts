/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextFunction, Request, Response } from 'express';
import status from 'http-status';

import { envVars } from '../config/env';
import AppError from '../errorHelpers/AppError';
import { prisma } from '../lib/prisma';
import { jwtUtils } from '../utils/jwt';
import { cookieUtils } from '../utils/cookie';

type Role = 'ADMIN' | 'USER';

declare global {
  namespace Express {
    interface Request {
      user: {
        userId: string;
        role: Role;
        email: string;
      };
    }
  }
}

/**
 * Authentication & Role-Based Access Guard.
 *
 * Usage:
 *   checkAuth()             → any authenticated user
 *   checkAuth('ADMIN')      → admin only
 *   checkAuth('USER')       → user only
 */
export const checkAuth = (...authRoles: Role[]) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // ── 1. Extract access token ───────────────────
      const accessToken = cookieUtils.getCookie(req, 'accessToken')
        || req.headers.authorization?.replace('Bearer ', '');

      if (!accessToken) {
        throw new AppError(status.UNAUTHORIZED, 'Unauthorized. Please log in to continue.');
      }

      const verifiedToken = jwtUtils.vefifyToken(accessToken, envVars.ACCESS_TOKEN_SECRET);

      if (!verifiedToken.success || !verifiedToken.data) {
        throw new AppError(status.UNAUTHORIZED, 'Unauthorized. Access token is invalid or expired.');
      }

      const { userId } = verifiedToken.data as { userId: string; role: Role; email: string };

      // ── 2. DB user check ──────────────────────────
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, email: true, isActive: true },
      });

      if (!user) {
        throw new AppError(status.UNAUTHORIZED, 'Unauthorized. User account not found.');
      }

      if (!user.isActive) {
        throw new AppError(status.FORBIDDEN, 'Your account has been deactivated. Please contact support.');
      }

      // ── 3. Role guard ─────────────────────────────
      if (authRoles.length > 0 && !authRoles.includes(user.role as Role)) {
        throw new AppError(
          status.FORBIDDEN,
          `Forbidden. This resource requires one of: [${authRoles.join(', ')}].`
        );
      }

      // ── 4. Attach user to request ─────────────────
      req.user = {
        userId: user.id,
        role: user.role as Role,
        email: user.email,
      };

      next();
    } catch (error: any) {
      next(error);
    }
  };