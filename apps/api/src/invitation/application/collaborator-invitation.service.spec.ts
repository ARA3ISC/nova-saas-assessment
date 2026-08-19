import { describe, expect, it, vi } from 'vitest';

import { CollaboratorInvitationService } from './collaborator-invitation.service';

describe('CollaboratorInvitationService', () => {
  const administrator = {
    identityId: 'administrator-id',
    organizationId: 'organization-id',
    membershipId: 'membership-id',
    profile: 'Administrator' as const,
    accessEpoch: 2,
  };

  function createPrisma() {
    const transaction = {
      $executeRaw: vi.fn(),
      invitation: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      },
      capabilityDefinition: { count: vi.fn().mockResolvedValue(0) },
      company: { count: vi.fn().mockResolvedValue(0) },
      businessScope: { count: vi.fn().mockResolvedValue(0) },
      membership: { findFirst: vi.fn().mockResolvedValue({ id: 'membership-id' }) },
      auditEvidence: { create: vi.fn() },
    };
    return {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
      transaction,
    };
  }

  it('refuses a User before opening a tenant transaction', async () => {
    const prisma = createPrisma();
    const notifications = {};
    const service = new CollaboratorInvitationService(
      prisma as never,
      notifications as never,
      { resolve: vi.fn() } as never,
    );

    await expect(
      service.invite({ ...administrator, profile: 'User' }, 'user@example.com'),
    ).rejects.toThrow('Access denied');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates and sends a User invitation under the server-resolved tenant context', async () => {
    const prisma = createPrisma();
    prisma.transaction.invitation.create.mockResolvedValue({
      id: 'invitation-id',
      expiresAt: new Date('2026-08-24T00:00:00.000Z'),
    });
    const notifications = {
      enqueueCollaboratorInvitation: vi.fn().mockResolvedValue({ id: 'outbox-id' }),
      deliver: vi.fn(),
    };
    const service = new CollaboratorInvitationService(
      prisma as never,
      notifications as never,
      { resolve: vi.fn().mockResolvedValue([]) } as never,
    );

    await expect(service.invite(administrator, ' User@Example.com ')).resolves.toEqual({
      invitationId: 'invitation-id',
      expiresAt: new Date('2026-08-24T00:00:00.000Z'),
    });

    expect(prisma.transaction.invitation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ normalizedEmail: 'user@example.com' }),
      }),
    );
    expect(prisma.transaction.invitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'organization-id',
          normalizedEmail: 'user@example.com',
          kind: 'COLLABORATOR',
          targetProfile: 'User',
        }),
      }),
    );
    expect(notifications.deliver).toHaveBeenCalledWith('outbox-id');
  });

  it('requires the explicit resend flow when a pending invitation already exists', async () => {
    const prisma = createPrisma();
    prisma.transaction.invitation.findFirst.mockResolvedValue({
      id: 'pending-id',
      expiresAt: new Date(Date.now() + 60_000),
    });
    const notifications = { deliver: vi.fn() };
    const service = new CollaboratorInvitationService(
      prisma as never,
      notifications as never,
      { resolve: vi.fn() } as never,
    );

    await expect(service.invite(administrator, 'user@example.test')).rejects.toThrow(
      'reasoned resend action',
    );
    expect(prisma.transaction.invitation.update).not.toHaveBeenCalled();
    expect(prisma.transaction.invitation.create).not.toHaveBeenCalled();
    expect(notifications.deliver).not.toHaveBeenCalled();
  });

  it('revokes an already-expired link before creating a fresh invitation', async () => {
    const prisma = createPrisma();
    prisma.transaction.invitation.findFirst.mockResolvedValue({
      id: 'expired-id',
      expiresAt: new Date(Date.now() - 1),
    });
    prisma.transaction.invitation.create.mockResolvedValue({
      id: 'fresh-id',
      expiresAt: new Date('2026-08-26T00:00:00.000Z'),
    });
    const notifications = {
      enqueueCollaboratorInvitation: vi.fn().mockResolvedValue({ id: 'outbox-id' }),
      deliver: vi.fn(),
    };
    const service = new CollaboratorInvitationService(
      prisma as never,
      notifications as never,
      { resolve: vi.fn() } as never,
    );

    await expect(service.invite(administrator, 'user@example.test')).resolves.toMatchObject({
      invitationId: 'fresh-id',
    });
    expect(prisma.transaction.invitation.update).toHaveBeenCalledWith({
      where: { id: 'expired-id' },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('uses a preset as an adjustable starting point and persists only final explicit grants', async () => {
    const prisma = createPrisma();
    prisma.transaction.invitation.create.mockResolvedValue({
      id: 'invitation-id',
      expiresAt: new Date('2026-08-24T00:00:00.000Z'),
    });
    const notifications = {
      enqueueCollaboratorInvitation: vi.fn().mockResolvedValue({ id: 'outbox-id' }),
      deliver: vi.fn(),
    };
    const presets = { resolve: vi.fn().mockResolvedValue(['companies.read']) };
    const service = new CollaboratorInvitationService(
      prisma as never,
      notifications as never,
      presets as never,
    );

    await service.invite(administrator, 'user@example.test', [], [], [], 'preset-version-id');

    expect(presets.resolve).toHaveBeenCalledWith(prisma.transaction, 'preset-version-id');
    expect(prisma.transaction.invitation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ capabilities: [] }) }),
    );
  });

  it('revokes a pending invitation and records evidence', async () => {
    const prisma = createPrisma();
    prisma.transaction.invitation.updateMany.mockResolvedValue({ count: 1 });
    prisma.transaction.capabilityDefinition.count.mockResolvedValue(1);
    const service = new CollaboratorInvitationService(
      prisma as never,
      {} as never,
      {
        resolve: vi.fn(),
      } as never,
    );

    await expect(
      service.revoke(administrator, 'invitation-id', 'Access is no longer needed', true),
    ).resolves.toEqual({ invitationId: 'invitation-id', revokedAt: expect.any(Date) });
    expect(prisma.transaction.auditEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'COLLABORATOR_INVITATION_REVOKED',
          subjectId: 'invitation-id',
        }),
      }),
    );
  });

  it('returns server-derived invitation history statuses without exposing tokens', async () => {
    const prisma = createPrisma();
    prisma.transaction.invitation.findMany.mockResolvedValue([
      {
        id: 'pending-id',
        email: 'pending@example.test',
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        capabilities: [],
        companyIds: [],
        businessScopeIds: [],
        consumedAt: null,
        revokedAt: null,
      },
      {
        id: 'expired-id',
        email: 'expired@example.test',
        expiresAt: new Date(Date.now() - 1),
        createdAt: new Date(),
        capabilities: [],
        companyIds: [],
        businessScopeIds: [],
        consumedAt: null,
        revokedAt: null,
      },
    ]);
    const service = new CollaboratorInvitationService(
      prisma as never,
      {} as never,
      { resolve: vi.fn() } as never,
    );

    const result = await service.listPending(administrator);

    expect(result.map((invitation) => invitation.status)).toEqual(['PENDING', 'EXPIRED']);
    expect(result.every((invitation) => !('tokenHash' in invitation))).toBe(true);
  });

  it('resends by atomically revoking the old invitation and creating a new token', async () => {
    const prisma = createPrisma();
    prisma.transaction.invitation.findFirst
      .mockResolvedValueOnce({
        email: 'user@example.com',
        capabilities: ['companies.read'],
        companyIds: [],
        businessScopeIds: [],
        organizationWideAccess: false,
      })
      .mockResolvedValueOnce({
        id: 'old-invitation-id',
        expiresAt: new Date(Date.now() + 60_000),
      });
    prisma.transaction.capabilityDefinition.count.mockResolvedValue(1);
    prisma.transaction.invitation.create.mockResolvedValue({
      id: 'replacement-id',
      expiresAt: new Date('2026-08-25T00:00:00.000Z'),
    });
    const notifications = {
      enqueueCollaboratorInvitation: vi.fn().mockResolvedValue({ id: 'outbox-id' }),
      deliver: vi.fn(),
    };
    const service = new CollaboratorInvitationService(
      prisma as never,
      notifications as never,
      { resolve: vi.fn().mockResolvedValue([]) } as never,
    );

    await expect(
      service.resend(administrator, 'old-invitation-id', 'Recipient requested a new link', true),
    ).resolves.toEqual({
      invitationId: 'replacement-id',
      expiresAt: new Date('2026-08-25T00:00:00.000Z'),
    });
    expect(prisma.transaction.invitation.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'old-invitation-id' } }),
    );
    expect(prisma.transaction.invitation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ expiresAt: expect.anything() }),
      }),
    );
    expect(prisma.transaction.auditEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'COLLABORATOR_INVITATION_RESENT' }),
      }),
    );
  });
});
