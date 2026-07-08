import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodSchema } from 'zod';
import AppError from '../errorHelpers/AppError';

type ParsedRequest = {
  body?: unknown;
  cookies?: unknown;
  params?: unknown;
  query?: unknown;
};

/**
 * Replace the keys of `target` with the keys of `source`, preserving the
 * same object reference. This is the Express-5 safe way to "rewrite" a
 * request slot like `req.query` or `req.params` — those are getter-only
 * properties on the underlying `IncomingMessage` and cannot be reassigned
 * (`TypeError: Cannot set property query of #<IncomingMessage> ...`).
 */
const replaceKeysInPlace = (target: Record<string, unknown>, source: unknown): void => {
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  if (source && typeof source === 'object') {
    Object.assign(target, source as Record<string, unknown>);
  }
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

      // Mutate in place: `req.query` is a getter on IncomingMessage in Express 5,
      // and `req.params` / `req.body` / `req.cookies` may also lose their setters
      // in future minors. Keeping the same object reference avoids the setter
      // entirely while still presenting the validated payload to downstream code.
      if (parsed.body !== undefined) replaceKeysInPlace(req.body as Record<string, unknown>, parsed.body);
      if (parsed.cookies !== undefined) replaceKeysInPlace(req.cookies as Record<string, unknown>, parsed.cookies);
      if (parsed.params !== undefined) replaceKeysInPlace(req.params as Record<string, string>, parsed.params);
      if (parsed.query !== undefined) replaceKeysInPlace(req.query as Record<string, unknown>, parsed.query);

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
