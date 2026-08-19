import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AccessService } from '../../access/application/access.service';
import { AuthService } from '../application/auth.service';

import { AuthenticatedRequest } from './auth.request';
import { SESSION_COOKIE_NAME } from './session-cookie';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly accessService: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const token = request.cookies?.[SESSION_COOKIE_NAME];

    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const session = await this.authService.validateSession(token);

    if (!session) {
      throw new UnauthorizedException('Invalid or expired session');
    }
    if (session.identity?.passwordCredential?.mustChangePassword) {
      throw new ForbiddenException('Password change required');
    }

    const effectiveAccess = await this.accessService.resolveEffectiveAccess(session.identityId);

    request.authSession = session;
    request.effectiveAccess = effectiveAccess;

    return true;
  }
}
