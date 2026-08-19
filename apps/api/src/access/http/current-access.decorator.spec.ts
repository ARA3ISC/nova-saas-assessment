import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { getCurrentAccess } from './current-access.decorator';

function createContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('CurrentAccess', () => {
  it('returns the effective access context', () => {
    const access = {
      identityId: 'identity-id',
      organizationId: 'organization-id',
      membershipId: 'membership-id',
      profile: 'Administrator' as const,
      accessEpoch: 3,
    };

    const context = createContext({
      effectiveAccess: access,
    });

    expect(getCurrentAccess(context)).toEqual(access);
  });

  it('rejects requests without effective access', () => {
    const context = createContext({});

    expect(() => getCurrentAccess(context)).toThrow(UnauthorizedException);
  });
});
