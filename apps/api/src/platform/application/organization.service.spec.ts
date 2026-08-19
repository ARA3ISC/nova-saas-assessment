import { describe, expect, it, vi } from 'vitest';
import { InvitationKind, OrganizationProfile } from '@prisma/client';

import { OrganizationService } from './organization.service';

describe('OrganizationService', () => {
  function createPrisma() {
    const transaction = {
      $executeRaw: vi.fn(),
      organization: {
        create: vi.fn(),
      },
      invitation: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    };

    return {
      $transaction: vi.fn(async (callback) => callback(transaction)),
      transaction,
      notifications: {
        enqueueInitialOwnerInvitation: vi.fn(),
        deliver: vi.fn(),
      },
    };
  }

  it('creates a provisioning organization and initial owner invitation atomically', async () => {
    const prisma = createPrisma();

    prisma.transaction.organization.create.mockResolvedValue({
      id: 'organization-id',
      name: 'Acme Inc',
      accessStatus: 'PROVISIONING',
      commercialStatus: 'DEMO',
    });

    prisma.transaction.invitation.findFirst.mockResolvedValue(null);

    prisma.transaction.invitation.create.mockResolvedValue({
      id: 'invitation-id',
      organizationId: 'organization-id',
      email: 'owner@example.com',
      normalizedEmail: 'owner@example.com',
      kind: InvitationKind.INITIAL_OWNER,
      targetProfile: OrganizationProfile.Administrator,
      expiresAt: new Date('2026-08-24T00:00:00.000Z'),
    });
    prisma.notifications.enqueueInitialOwnerInvitation.mockResolvedValue({
      id: 'outbox-message-id',
    });

    const service = new OrganizationService(
      prisma as unknown as ConstructorParameters<typeof OrganizationService>[0],
      prisma.notifications as unknown as ConstructorParameters<typeof OrganizationService>[1],
    );

    const result = await service.createOrganization({
      name: ' Acme Inc ',
      ownerEmail: 'owner@example.com',
    });

    expect(result).toMatchObject({
      organizationId: 'organization-id',
      invitationId: 'invitation-id',
      expiresAt: expect.any(Date),
    });

    expect(prisma.$transaction).toHaveBeenCalledOnce();

    expect(prisma.transaction.organization.create).toHaveBeenCalledWith({
      data: {
        name: 'Acme Inc',
        accessStatus: 'PROVISIONING',
        commercialStatus: 'DEMO',
      },
    });

    expect(prisma.transaction.invitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'organization-id',
          email: 'owner@example.com',
          normalizedEmail: 'owner@example.com',
          kind: InvitationKind.INITIAL_OWNER,
          targetProfile: OrganizationProfile.Administrator,
        }),
      }),
    );

    expect(prisma.notifications.enqueueInitialOwnerInvitation).toHaveBeenCalledWith(
      prisma.transaction,
      expect.objectContaining({
        organizationId: 'organization-id',
        recipient: 'owner@example.com',
        token: expect.any(String),
      }),
    );
    expect(prisma.notifications.deliver).toHaveBeenCalledWith('outbox-message-id');
  });

  it('rejects an empty organization name', async () => {
    const prisma = createPrisma();

    const service = new OrganizationService(
      prisma as unknown as ConstructorParameters<typeof OrganizationService>[0],
      prisma.notifications as unknown as ConstructorParameters<typeof OrganizationService>[1],
    );

    await expect(
      service.createOrganization({
        name: '   ',
        ownerEmail: 'owner@example.com',
      }),
    ).rejects.toThrow('Organization name is required');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an invalid owner email', async () => {
    const prisma = createPrisma();

    const service = new OrganizationService(
      prisma as unknown as ConstructorParameters<typeof OrganizationService>[0],
      prisma.notifications as unknown as ConstructorParameters<typeof OrganizationService>[1],
    );

    await expect(
      service.createOrganization({
        name: 'Acme Inc',
        ownerEmail: 'not-an-email',
      }),
    ).rejects.toThrow();

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('replaces a provisioning initial-owner invitation and erases the pending old envelope', async () => {
    const tx = {
      $executeRaw: vi.fn(),
      $queryRaw: vi
        .fn()
        .mockResolvedValue([{ id: 'organization-id', accessStatus: 'PROVISIONING', version: 3 }]),
      organization: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      invitation: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'old-invitation-id',
          email: 'owner@example.test',
          normalizedEmail: 'owner@example.test',
        }),
        update: vi.fn(),
        create: vi.fn().mockResolvedValue({
          id: 'new-invitation-id',
          expiresAt: new Date('2026-08-26T00:00:00.000Z'),
        }),
      },
      outboxMessage: { updateMany: vi.fn() },
      auditEvidence: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    };
    const notifications = {
      enqueueInitialOwnerInvitation: vi.fn().mockResolvedValue({ id: 'new-outbox-id' }),
      deliver: vi.fn(),
    };
    const service = new OrganizationService(prisma as never, notifications as never);

    await expect(
      service.resendInitialOwnerInvitation({
        organizationId: 'organization-id',
        actorId: 'platform-actor-id',
        expectedVersion: 3,
        reason: 'Recipient requested a replacement',
        confirmed: true,
      }),
    ).resolves.toMatchObject({
      organizationId: 'organization-id',
      invitationId: 'new-invitation-id',
      version: 4,
    });
    expect(tx.invitation.update).toHaveBeenCalledWith({
      where: { id: 'old-invitation-id' },
      data: { revokedAt: expect.any(Date) },
    });
    expect(tx.outboxMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'EXPIRED',
          encryptedEnvelope: '',
          lastFailureCode: 'CREDENTIAL_REPLACED',
        }),
      }),
    );
    expect(tx.auditEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'INITIAL_OWNER_INVITATION_RESENT' }),
      }),
    );
    expect(notifications.deliver).toHaveBeenCalledWith('new-outbox-id');
  });

  it('returns minimized Organizations using a stable bounded cursor page', async () => {
    const rows = [
      { id: '00000000-0000-4000-8000-000000000003', name: 'Three' },
      { id: '00000000-0000-4000-8000-000000000002', name: 'Two' },
      { id: '00000000-0000-4000-8000-000000000001', name: 'One' },
    ];
    const prisma = { organization: { findMany: vi.fn().mockResolvedValue(rows) } };
    const service = new OrganizationService(prisma as never, {} as never);

    await expect(service.listOrganizations({ take: 2 })).resolves.toEqual({
      items: rows.slice(0, 2),
      nextCursor: rows[1]?.id,
    });
    expect(prisma.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 3,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: expect.not.objectContaining({ companies: expect.anything() }),
      }),
    );
  });

  it('terminally disables an organization and revokes its member sessions', async () => {
    const transaction = {
      $executeRaw: vi.fn(),
      organization: { findUnique: vi.fn(), updateMany: vi.fn() },
      membership: { findMany: vi.fn(), updateMany: vi.fn() },
      authSession: { updateMany: vi.fn() },
      invitation: { updateMany: vi.fn() },
      outboxMessage: { updateMany: vi.fn() },
      ownershipTransferProposal: { updateMany: vi.fn() },
      auditEvidence: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    transaction.organization.findUnique.mockResolvedValue({
      id: 'organization-id',
      accessStatus: 'ACTIVE',
      version: 1,
    });
    transaction.organization.updateMany.mockResolvedValue({ count: 1 });
    transaction.membership.findMany.mockResolvedValue([
      { identityId: 'identity-a' },
      { identityId: 'identity-b' },
    ]);
    const notifications = {};
    const service = new OrganizationService(prisma as never, notifications as never);

    await expect(
      service.changeAccessStatus({
        organizationId: 'organization-id',
        status: 'DISABLED',
        actorId: 'actor-id',
        reason: 'Required lifecycle action',
        confirmed: true,
        expectedVersion: 1,
      }),
    ).resolves.toEqual({ id: 'organization-id', accessStatus: 'DISABLED', version: 2 });
    expect(transaction.membership.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accessEpoch: { increment: 1 } }) }),
    );
    expect(transaction.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          identityId: { in: ['identity-a', 'identity-b'] },
          revokedAt: null,
        }),
      }),
    );
    expect(transaction.invitation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { revokedAt: expect.any(Date) } }),
    );
    expect(transaction.ownershipTransferProposal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'CANCELLED', cancelledAt: expect.any(Date) } }),
    );
    expect(transaction.outboxMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: 'EXPIRED',
          encryptedEnvelope: '',
          lastFailureCode: 'ORGANIZATION_DISABLED',
        },
      }),
    );
  });

  it('does not allow a terminally disabled organization to reactivate', async () => {
    const tx = {
      $executeRaw: vi.fn(),
      organization: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 'organization-id', accessStatus: 'DISABLED', version: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    };
    const service = new OrganizationService(prisma as never, {} as never);
    await expect(
      service.changeAccessStatus({
        organizationId: 'organization-id',
        status: 'ACTIVE',
        actorId: 'actor-id',
        reason: 'Required lifecycle action',
        confirmed: true,
        expectedVersion: 1,
      }),
    ).rejects.toThrow('Disabled organizations cannot be reactivated');
  });

  it('treats a repeated commercial status as an idempotent no-op', async () => {
    const tx = {
      $executeRaw: vi.fn(),
      organization: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'organization-id',
          commercialStatus: 'PILOT',
          version: 7,
        }),
        updateMany: vi.fn(),
      },
      auditEvidence: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    };
    const service = new OrganizationService(prisma as never, {} as never);

    await expect(
      service.changeCommercialStatus({
        organizationId: 'organization-id',
        status: 'PILOT',
        actorId: 'actor-id',
        reason: 'Repeated request',
        confirmed: true,
        expectedVersion: 7,
      }),
    ).resolves.toEqual({ id: 'organization-id', commercialStatus: 'PILOT', version: 7 });
    expect(tx.organization.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvidence.create).not.toHaveBeenCalled();
  });

  it('does not activate a provisioning organization outside owner acceptance', async () => {
    const tx = {
      $executeRaw: vi.fn(),
      organization: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 'organization-id', accessStatus: 'PROVISIONING', version: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    };
    const service = new OrganizationService(prisma as never, {} as never);
    await expect(
      service.changeAccessStatus({
        organizationId: 'organization-id',
        status: 'ACTIVE',
        actorId: 'actor-id',
        reason: 'Required lifecycle action',
        confirmed: true,
        expectedVersion: 1,
      }),
    ).rejects.toThrow('Initial owner acceptance is the only path');
  });

  it('does not suspend provisioning and later permit an ownerless activation path', async () => {
    const tx = {
      $executeRaw: vi.fn(),
      organization: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 'organization-id', accessStatus: 'PROVISIONING', version: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    };
    const service = new OrganizationService(prisma as never, {} as never);

    await expect(
      service.changeAccessStatus({
        organizationId: 'organization-id',
        status: 'SUSPENDED',
        actorId: 'actor-id',
        reason: 'Attempted lifecycle shortcut',
        confirmed: true,
        expectedVersion: 1,
      }),
    ).rejects.toThrow('Initial owner acceptance is the only path');
  });

  it('lists only minimized active non-owner intervention candidates', async () => {
    const candidates = [
      {
        id: 'membership-id',
        profile: OrganizationProfile.User,
        status: 'ACTIVE',
        identity: { email: 'collaborator@example.com' },
      },
    ];
    const tx = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'organization-id' }]),
      membership: {
        findFirst: vi.fn().mockResolvedValue({ id: 'platform-context' }),
        findMany: vi.fn().mockResolvedValue(candidates),
      },
    };
    const prisma = {
      organization: {
        findUnique: vi.fn().mockResolvedValue({ id: 'organization-id', accessStatus: 'ACTIVE' }),
      },
      $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    };
    const service = new OrganizationService(prisma as never, {} as never);

    await expect(
      service.listInterventionCandidates('organization-id', 'platform-identity-id'),
    ).resolves.toEqual(candidates);
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: 'organization-id' },
      select: { id: true, accessStatus: true },
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(4);
    expect(tx.membership.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'organization-id', status: 'ACTIVE', ownership: null },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: {
        id: true,
        profile: true,
        status: true,
        identity: { select: { email: true } },
      },
    });
  });

  it('runs a Platform collaborator intervention inside one forced-RLS tenant transaction', async () => {
    const tx = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'organization-id' }]),
      membership: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'membership-id',
          identityId: 'identity-id',
          status: 'ACTIVE',
          accessEpoch: 2,
          version: 4,
          ownership: null,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      authSession: { updateMany: vi.fn() },
      ownershipTransferProposal: { updateMany: vi.fn() },
      auditEvidence: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    };
    const service = new OrganizationService(prisma as never, {} as never);

    await service.suspendCollaborator({
      organizationId: 'organization-id',
      membershipId: 'membership-id',
      reason: 'Security intervention',
      actorId: 'platform-identity-id',
      confirmed: true,
    });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(4);
    expect(tx.membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'membership-id',
          organizationId: 'organization-id',
        }),
      }),
    );
    expect(tx.membership.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACTIVE', version: 4 }),
      }),
    );
  });
});
