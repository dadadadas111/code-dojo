import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../errors';

// X-Teacher is forwarded by the trusted bot as a signal that the caller holds a teacher role.
// This is self-documentation only, NOT a security control — the real boundary is API_KEY.
export function requireTeacher(req: Request, _res: Response, next: NextFunction): void {
  if (req.header('X-Teacher') === 'true') {
    next();
    return;
  }
  next(new ForbiddenError('Teacher-only operation'));
}
