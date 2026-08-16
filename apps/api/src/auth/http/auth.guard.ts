import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AccessService } from '../../access/application/access.service';
import { AuthService } from '../application/auth.service';

import { AuthenticatedRequest } from './auth.request';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly accessService: AccessService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const request =
      context
        .switchToHttp()
        .getRequest<AuthenticatedRequest>();

    const token = request.cookies?.nova_session;

    if (!token) {
      throw new UnauthorizedException(
        'Authentication required',
      );
    }

    const session =
      await this.authService.validateSession(token);

    if (!session) {
      throw new UnauthorizedException(
        'Invalid or expired session',
      );
    }

    const effectiveAccess =
      await this.accessService.resolveEffectiveAccess(
        session.identityId,
      );

    request.authSession = session;
    request.effectiveAccess = effectiveAccess;

    return true;
  }
}
