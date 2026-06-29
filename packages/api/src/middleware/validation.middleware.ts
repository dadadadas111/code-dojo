import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodSchema } from 'zod';

interface ValidationSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body !== undefined) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.params !== undefined) {
        req.params = schemas.params.parse(req.params) as Record<string, string>;
      }
      if (schemas.query !== undefined) {
        req.query = schemas.query.parse(req.query) as Record<string, string | string[] | undefined>;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
