// Small Express helpers: async error forwarding + zod body validation.
import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';
import { HttpError } from './errors';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** Wrap an async route so thrown/rejected errors reach the error middleware. */
export function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

/** Parse/validate a request body with zod; invalid input -> 422 (like FastAPI). */
export function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join('.') || 'body';
    throw new HttpError(422, `Input tidak valid: ${path} — ${first?.message ?? 'invalid'}`);
  }
  return result.data;
}
