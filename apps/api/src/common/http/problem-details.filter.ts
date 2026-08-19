import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { CorrelatedRequest } from './correlation.middleware';

const TITLES: Record<number, string> = {
  400: 'Invalid request',
  401: 'Authentication required',
  403: 'Access denied',
  404: 'Resource unavailable',
  409: 'Request conflict',
  429: 'Too many requests',
  500: 'Unexpected server error',
};

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<CorrelatedRequest>();
    const response = http.getResponse<Response>();
    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const correlationId = request.correlationId ?? 'correlation-unavailable';
    const detail = isHttp ? this.safeDetail(exception) : 'The request could not be completed.';


    this.logger.warn(
      JSON.stringify({
        event: 'http.request.failed',
        timestamp: new Date().toISOString(),
        correlationId,
        method: request.method,
        path: request.path,
        status,
        code: `NOVA_HTTP_${status}`,
      }),
    );

    response
      .status(status)
      .type('application/problem+json')
      .json({
        type: `https://nova.invalid/problems/http-${status}`,
        title: TITLES[status] ?? 'Request failed',
        status,
        code: `NOVA_HTTP_${status}`,
        detail,
        message: detail,
        correlationId,
        timestamp: new Date().toISOString(),
        instance: request.path,
      });
  }

  private safeDetail(exception: HttpException): string {
    const body = exception.getResponse();
    if (typeof body === 'string') return body;
    if (body && typeof body === 'object' && 'message' in body) {
      const message = (body as { message?: unknown }).message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && message.every((item) => typeof item === 'string')) {
        return message.join(', ');
      }
    }
    return TITLES[exception.getStatus()] ?? 'The request could not be completed.';
  }
}
