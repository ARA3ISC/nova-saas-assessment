import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

export type CorrelatedRequest = Request & { correlationId?: string };

const SAFE_CORRELATION_ID = /^[A-Za-z0-9._-]{8,64}$/;

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(request: CorrelatedRequest, response: Response, next: NextFunction): void {
    const supplied = request.header('x-correlation-id');
    request.correlationId =
      supplied && SAFE_CORRELATION_ID.test(supplied) ? supplied : randomUUID();
    response.setHeader('X-Correlation-Id', request.correlationId);
    next();
  }
}
