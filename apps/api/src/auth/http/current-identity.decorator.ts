import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

import { AuthenticatedRequest } from './auth.request';

export function getCurrentIdentity(
  context: ExecutionContext,
): string {
  const request =
    context.switchToHttp().getRequest<AuthenticatedRequest>();

  const identityId = request.authSession?.identityId;

  if (!identityId) {
    throw new UnauthorizedException('Authentication required');
  }

  return identityId;
}

export const CurrentIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    return getCurrentIdentity(context);
  },
);
