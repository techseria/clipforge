import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function requestId() {
  return (req: Request, res: Response, next: NextFunction) => {
    const incoming = req.header('x-request-id');
    req.id = incoming && incoming.length <= 200 ? incoming : randomUUID();
    res.setHeader('x-request-id', req.id);
    next();
  };
}