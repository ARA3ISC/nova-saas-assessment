import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { PrismaService } from './prisma.service';
import { withTenantContext } from './tenant-transaction';

describe('withTenantContext', () => {
  it('sets the tenant context before executing the callback', async () => {
    const executeRaw = vi.fn().mockResolvedValue(0);

    const transaction = {
      $executeRaw: executeRaw,
    } as unknown as Prisma.TransactionClient;

    const prisma = {
      $transaction: vi.fn(
        async (
          callback: (
            tx: Prisma.TransactionClient,
          ) => Promise<unknown>,
        ) => {
          return callback(transaction);
        },
      ),
    } as unknown as PrismaService;

    const callback = vi.fn().mockResolvedValue('result');

    const result = await withTenantContext(
      prisma,
      {
        organizationId: 'organization-id',
        actorId: 'actor-id',
        accessEpoch: 3,
      },
      callback,
    );

    expect(result).toBe('result');

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(executeRaw).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(transaction);
  });

  it('does not execute a transaction with an invalid context', async () => {
    const prisma = {
      $transaction: vi.fn(),
    } as unknown as PrismaService;

    const callback = vi.fn();

    await expect(
      withTenantContext(
        prisma,
        {
          organizationId: '',
          actorId: 'actor-id',
          accessEpoch: 0,
        },
        callback,
      ),
    ).rejects.toThrow('organizationId is required');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });
});
