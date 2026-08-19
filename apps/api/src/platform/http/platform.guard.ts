import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AuthService } from '../../auth/application/auth.service';
import { AuthenticatedRequest } from '../../auth/http/auth.request';
import { PlatformRepository } from '../infrastructure/platform.repository';
import { SESSION_COOKIE_NAME } from '../../auth/http/session-cookie';

@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly platformRepository: PlatformRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const token = request.cookies?.[SESSION_COOKIE_NAME];

    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const session = await this.authService.validateSession(token);

    if (!session) {
      throw new UnauthorizedException('Authentication required');
    }
    if (session.identity?.passwordCredential?.mustChangePassword) {
      throw new ForbiddenException('Password change required');
    }

    const principal = await this.platformRepository.findPlatformPrincipalByIdentity(
      session.identityId,
    );

    if (!principal || principal.identity.status !== 'ACTIVE') {
      throw new UnauthorizedException('Platform access required');
    }

    request.authSession = session;

    return true;
  }
}
