import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

import { AuthenticatedRequest } from '../../auth/http/auth.request';

export function getCurrentAccess(context: ExecutionContext) {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

  const effectiveAccess = request.effectiveAccess;

  if (!effectiveAccess) {
    throw new UnauthorizedException('Authentication required');
  }

  return effectiveAccess;
}

export const CurrentAccess = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  getCurrentAccess(context),
);
