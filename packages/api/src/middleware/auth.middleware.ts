import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { UnauthorizedError } from '../errors';

export function requireApiKey(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new UnauthorizedError('Invalid or missing API key'));
    return;
  }

  const token = authHeader.slice(7);
  const expected = env.API_KEY;

  // Guard length before timingSafeEqual to avoid throw on unequal buffer lengths
  if (token.length !== expected.length) {
    next(new UnauthorizedError('Invalid or missing API key'));
    return;
  }

  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expected);

  if (!crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
    next(new UnauthorizedError('Invalid or missing API key'));
    return;
  }

  next();
}
