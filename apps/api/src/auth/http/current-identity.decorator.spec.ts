import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { getCurrentIdentity } from './current-identity.decorator';

describe('CurrentIdentity', () => {
  it('returns the authenticated identity id', () => {
    const request = {
      authSession: {
        identityId: 'identity-id',
      },
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    expect(getCurrentIdentity(context)).toBe('identity-id');
  });

  it('rejects when there is no authenticated session', () => {
    const request = {};

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    expect(() => getCurrentIdentity(context)).toThrow(UnauthorizedException);
  });
});
