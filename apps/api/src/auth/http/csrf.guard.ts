import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { AuthenticatedRequest } from './auth.request';

export const CSRF_COOKIE_NAME = 'nova_csrf';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return true;
    }
    const cookie = request.cookies?.[CSRF_COOKIE_NAME];
    const header = request.headers['x-csrf-token'];
    const token = Array.isArray(header) ? undefined : header;
    if (
      !cookie ||
      !token ||
      cookie.length !== token.length ||
      !timingSafeEqual(Buffer.from(cookie), Buffer.from(token))
    ) {
      throw new ForbiddenException('CSRF validation failed');
    }
    return true;
  }
}
