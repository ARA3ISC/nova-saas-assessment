import { describe, expect, it, vi } from 'vitest';

import {
  PASSWORD_RESET_MINIMUM_RESPONSE_MS,
  PasswordResetHttpService,
} from './password-reset-http.service';

function dependencies(identity: unknown) {
  const tx = {
    identity: { findUnique: vi.fn().mockResolvedValue(identity) },
    passwordResetToken: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: 'token-id' }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
  };
  const notifications = {
    enqueuePasswordReset: vi.fn().mockResolvedValue({ id: 'message-id' }),
    deliver: vi.fn().mockResolvedValue(undefined),
  };
  const resets = { resetPassword: vi.fn() };
  const throttle = {
    isLocked: vi.fn().mockResolvedValue(false),
    recordFailure: vi.fn().mockResolvedValue(undefined),
  };
  return { tx, prisma, notifications, resets, throttle };
}

describe('PasswordResetHttpService', () => {
  it('keeps an unknown account neutral without creating a token or message', async () => {
    const deps = dependencies(null);
    const service = new PasswordResetHttpService(
      deps.prisma as never,
      deps.notifications as never,
      deps.resets as never,
      deps.throttle as never,
    );

    await service.request('unknown@example.test', 'source-a');

    expect(deps.tx.passwordResetToken.create).not.toHaveBeenCalled();
    expect(deps.notifications.enqueuePasswordReset).not.toHaveBeenCalled();
    expect(deps.notifications.deliver).not.toHaveBeenCalled();
  });

  it('enqueues Platform Administrator recovery without an Organization association', async () => {
    const deps = dependencies({
      id: 'identity-id',
      email: 'platform@example.test',
      status: 'ACTIVE',
      membership: null,
      platformPrincipal: { id: 'platform-principal-id' },
      passwordCredential: { id: 'credential-id' },
    });
    const service = new PasswordResetHttpService(
      deps.prisma as never,
      deps.notifications as never,
      deps.resets as never,
      deps.throttle as never,
    );

    await service.request('platform@example.test', 'source-a');

    expect(deps.notifications.enqueuePasswordReset).toHaveBeenCalledWith(
      deps.tx,
      expect.objectContaining({
        organizationId: null,
        recipient: 'platform@example.test',
        token: expect.any(String),
      }),
    );
    expect(deps.notifications.deliver).toHaveBeenCalledWith('message-id');
    const expiresAt = deps.tx.passwordResetToken.create.mock.calls[0]?.[0].data.expiresAt as Date;
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 60 * 1000);
    expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(30 * 60 * 1000);
  });

  it('does not wait for email delivery before returning the neutral response', async () => {
    const deps = dependencies({
      id: 'identity-id',
      email: 'member@example.test',
      status: 'ACTIVE',
      membership: { organizationId: 'organization-id' },
      platformPrincipal: null,
      passwordCredential: { id: 'credential-id' },
    });
    deps.notifications.deliver.mockReturnValue(new Promise(() => undefined));
    const service = new PasswordResetHttpService(
      deps.prisma as never,
      deps.notifications as never,
      deps.resets as never,
      deps.throttle as never,
    );

    const startedAt = Date.now();
    await service.request('member@example.test', 'source-a');

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(PASSWORD_RESET_MINIMUM_RESPONSE_MS - 10);
    expect(deps.notifications.deliver).toHaveBeenCalledWith('message-id');
  });

  it('applies the same minimum response floor to unknown and throttled accounts', async () => {
    const unknown = dependencies(null);
    const unknownService = new PasswordResetHttpService(
      unknown.prisma as never,
      unknown.notifications as never,
      unknown.resets as never,
      unknown.throttle as never,
    );
    const unknownStartedAt = Date.now();
    await unknownService.request('unknown@example.test', 'source-a');

    const throttled = dependencies(null);
    throttled.throttle.isLocked.mockResolvedValue(true);
    const throttledService = new PasswordResetHttpService(
      throttled.prisma as never,
      throttled.notifications as never,
      throttled.resets as never,
      throttled.throttle as never,
    );
    const throttledStartedAt = Date.now();
    await throttledService.request('unknown@example.test', 'source-a');

    expect(Date.now() - unknownStartedAt).toBeGreaterThanOrEqual(
      PASSWORD_RESET_MINIMUM_RESPONSE_MS - 10,
    );
    expect(Date.now() - throttledStartedAt).toBeGreaterThanOrEqual(
      PASSWORD_RESET_MINIMUM_RESPONSE_MS - 10,
    );
  });

  it('keeps a throttled request neutral without touching identity storage', async () => {
    const deps = dependencies(null);
    deps.throttle.isLocked.mockResolvedValue(true);
    const service = new PasswordResetHttpService(
      deps.prisma as never,
      deps.notifications as never,
      deps.resets as never,
      deps.throttle as never,
    );

    await expect(service.request('unknown@example.test', 'source-a')).resolves.toBeUndefined();
    expect(deps.prisma.$transaction).not.toHaveBeenCalled();
  });
});
