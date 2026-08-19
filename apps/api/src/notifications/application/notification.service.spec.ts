import { describe, expect, it, vi } from 'vitest';
import { TransactionalEmailTemplate } from '@prisma/client';

import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  it('replays every message in a bounded pending batch', async () => {
    const prisma = {
      outboxMessage: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([{ id: 'message-a' }, { id: 'message-b' }]),
      },
    };
    const service = new NotificationService(prisma as never, { send: vi.fn() });
    const deliver = vi.spyOn(service, 'deliver').mockResolvedValue(undefined);

    await service.dispatchPending();

    expect(prisma.outboxMessage.findMany).toHaveBeenCalledWith({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 25,
      select: { id: true },
    });
    expect(deliver).toHaveBeenCalledWith('message-a');
    expect(deliver).toHaveBeenCalledWith('message-b');
  });

  it('terminally expires unusable credential envelopes before dispatch', async () => {
    const prisma = {
      outboxMessage: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new NotificationService(prisma as never, { send: vi.fn() });
    const now = new Date('2026-08-19T12:00:00.000Z');

    await service.expireCredentialEnvelopes(now);

    expect(prisma.outboxMessage.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.outboxMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PENDING',
          template: TransactionalEmailTemplate.PASSWORD_RESET_V1,
          createdAt: { lte: new Date('2026-08-19T11:30:00.000Z') },
        }),
        data: {
          status: 'EXPIRED',
          encryptedEnvelope: '',
          lastFailureCode: 'CREDENTIAL_EXPIRED',
        },
      }),
    );
  });
});
