import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { RecentAuthGuard } from './recent-auth.guard';

function context(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('RecentAuthGuard', () => {
  it('allows a session authenticated in the last fifteen minutes', () => {
    const guard = new RecentAuthGuard();
    expect(guard.canActivate(context({ authSession: { recentAuthenticatedAt: new Date() } }))).toBe(
      true,
    );
  });

  it('rejects an absent or stale recent authentication timestamp', () => {
    const guard = new RecentAuthGuard();
    expect(() => guard.canActivate(context({ authSession: {} }))).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(
        context({ authSession: { recentAuthenticatedAt: new Date(Date.now() - 16 * 60 * 1000) } }),
      ),
    ).toThrow(ForbiddenException);
  });
});
