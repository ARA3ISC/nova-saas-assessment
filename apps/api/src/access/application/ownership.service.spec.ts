import { describe, expect, it, vi } from 'vitest';

import { EffectiveAccess } from './access.service';
import { OwnershipService } from './ownership.service';

const ownerAccess: EffectiveAccess = {
  identityId: 'owner-identity-id',
  organizationId: 'organization-id',
  membershipId: 'owner-membership-id',
  profile: 'Administrator',
  accessEpoch: 3,
};

function fixture(targetOwnership: { id: string } | null = null) {
  const target = {
    id: 'administrator-membership-id',
    identityId: 'administrator-identity-id',
    profile: 'Administrator' as const,
    version: 5,
    ownership: targetOwnership,
  };
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    organizationOwnership: { findFirst: vi.fn().mockResolvedValue({ id: 'ownership-id' }) },
    membership: {
      findFirst: vi
        .fn()
        .mockResolvedValueOnce(target)
        .mockResolvedValueOnce({ id: ownerAccess.membershipId }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    ownershipTransferProposal: { updateMany: vi.fn() },
    authSession: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    auditEvidence: { create: vi.fn().mockResolvedValue({ id: 'audit-id' }) },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return { service: new OwnershipService(prisma as never), tx };
}

describe('OwnershipService.demote', () => {
  it('changes a non-owner Administrator to User and immediately revokes sessions', async () => {
    const { service, tx } = fixture();

    await expect(
      service.demote(ownerAccess, 'administrator-membership-id', 'Responsibilities changed', true),
    ).resolves.toEqual({ id: 'administrator-membership-id', profile: 'User', version: 6 });

    expect(tx.membership.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ version: 5, profile: 'Administrator' }),
      }),
    );
    expect(tx.authSession.updateMany).toHaveBeenCalledWith({
      where: { identityId: 'administrator-identity-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(tx.ownershipTransferProposal.updateMany).toHaveBeenCalledWith({
      where: { successorMembershipId: 'administrator-membership-id', status: 'PENDING' },
      data: { status: 'CANCELLED', cancelledAt: expect.any(Date) },
    });
    expect(tx.auditEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'COLLABORATOR_DEMOTED',
          before: { profile: 'Administrator', version: 5 },
          after: { profile: 'User', version: 6 },
        }),
      }),
    );
  });

  it('never permits the current owner to be demoted', async () => {
    const { service, tx } = fixture({ id: 'ownership-id' });

    await expect(
      service.demote(ownerAccess, 'owner-membership-id', 'Unsafe owner change', true),
    ).rejects.toThrow('Eligible non-owner Administrator not found');
    expect(tx.membership.updateMany).not.toHaveBeenCalled();
    expect(tx.authSession.updateMany).not.toHaveBeenCalled();
  });
});

describe('OwnershipService.promote', () => {
  it('advances access and revokes the promoted User sessions', async () => {
    const tx = {
      $executeRaw: vi.fn(),
      organizationOwnership: { findFirst: vi.fn().mockResolvedValue({ id: 'ownership-id' }) },
      membership: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'user-membership-id',
          identityId: 'user-identity-id',
          profile: 'User',
          version: 2,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      authSession: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      auditEvidence: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new OwnershipService(prisma as never);

    await service.promote(ownerAccess, 'user-membership-id', 'Expanded responsibility', true);

    expect(tx.membership.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ version: 2, profile: 'User' }),
        data: expect.objectContaining({ accessEpoch: { increment: 1 } }),
      }),
    );
    expect(tx.authSession.updateMany).toHaveBeenCalledWith({
      where: { identityId: 'user-identity-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

describe('OwnershipService.listPending', () => {
  it('returns a support-safe proposer email instead of requiring a membership ID lookup', async () => {
    const proposal = {
      id: 'proposal-id',
      proposerMembershipId: 'owner-membership-id',
      successorMembershipId: 'administrator-membership-id',
      expiresAt: new Date('2026-08-26T00:00:00.000Z'),
      createdAt: new Date('2026-08-19T00:00:00.000Z'),
    };
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      ownershipTransferProposal: { findMany: vi.fn().mockResolvedValue([proposal]) },
      membership: {
        findFirst: vi.fn().mockResolvedValue({ id: ownerAccess.membershipId }),
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: 'owner-membership-id', identity: { email: 'owner@example.test' } },
          ]),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new OwnershipService(prisma as never);

    await expect(service.listPending(ownerAccess)).resolves.toEqual([
      { ...proposal, proposerEmail: 'owner@example.test' },
    ]);
    expect(tx.membership.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['owner-membership-id'] } },
      select: { id: true, identity: { select: { email: true } } },
    });
  });
});
