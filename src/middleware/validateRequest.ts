import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodSchema } from 'zod';
import AppError from '../errorHelpers/AppError';

type ParsedRequest = {
  body?: unknown;
  cookies?: unknown;
  params?: unknown;
  query?: unknown;
};

export const validateRequest =
  (schema: ZodSchema) => async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        cookies: req.cookies,
        params: req.params,
        query: req.query,
      }) as ParsedRequest;

      req.body = (parsed.body ?? req.body) as Record<string, unknown>;
      req.cookies = (parsed.cookies ?? req.cookies) as Record<string, unknown>;
      req.params = (parsed.params ?? req.params) as Record<string, string>;
      req.query = (parsed.query ?? req.query) as Record<string, unknown>;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const message = error.issues[0]?.message ?? 'Validation failed.';
        next(new AppError(400, message, 'VALIDATION_ERROR'));
        return;
      }
      next(error);
    }
  };
