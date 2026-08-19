import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

import { AuthService } from '../application/auth.service';
import { AuthenticatedRequest } from './auth.request';
import { SESSION_COOKIE_NAME } from './session-cookie';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.[SESSION_COOKIE_NAME];
    if (!token) throw new UnauthorizedException('Authentication required');

    const session = await this.authService.validateSession(token);
    if (!session) throw new UnauthorizedException('Invalid or expired session');
    request.authSession = session;
    return true;
  }
}
