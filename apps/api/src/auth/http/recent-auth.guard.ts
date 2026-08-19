import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import { AuthenticatedRequest } from './auth.request';

const RECENT_AUTHENTICATION_WINDOW_MS = 10 * 60 * 1000;

@Injectable()
export class RecentAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const recentAuthenticatedAt = request.authSession?.recentAuthenticatedAt;

    if (
      !recentAuthenticatedAt ||
      Date.now() - recentAuthenticatedAt.getTime() > RECENT_AUTHENTICATION_WINDOW_MS
    ) {
      throw new ForbiddenException('Recent authentication is required for this action');
    }

    return true;
  }
}
