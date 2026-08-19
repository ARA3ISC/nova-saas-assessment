import { describe, expect, it, vi } from 'vitest';

import { EffectiveAccess } from './access.service';
import { CollaboratorLifecycleService } from './collaborator-lifecycle.service';

const administrator: EffectiveAccess = {
  identityId: 'identity-id',
  organizationId: 'organization-id',
  membershipId: 'membership-id',
  profile: 'Administrator',
  accessEpoch: 2,
};

function fixture() {
  const collaborators = [
    {
      id: 'collaborator-id',
      profile: 'User',
      status: 'ACTIVE',
      accessEpoch: 1,
      identity: { email: 'user@example.test' },
      ownership: null,
      capabilityGrants: [],
      companyGrants: [],
      businessScopeGrants: [],
    },
  ];
  const tx = {
    $executeRaw: vi.fn(),
    membership: {
      findMany: vi.fn().mockResolvedValue(collaborators),
      findFirst: vi.fn().mockResolvedValue({ id: administrator.membershipId }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return {
    collaborators,
    prisma,
    service: new CollaboratorLifecycleService(prisma as never, {} as never),
    tx,
  };
}

describe('CollaboratorLifecycleService.list', () => {
  it('returns a bounded tenant collaborator directory for an Administrator', async () => {
    const { collaborators, service, tx } = fixture();

    await expect(service.list(administrator)).resolves.toEqual(collaborators);
    expect(tx.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
        orderBy: { identity: { email: 'asc' } },
        select: expect.objectContaining({
          identity: { select: { email: true } },
          ownership: { select: { id: true } },
        }),
      }),
    );
  });

  it('refuses directory access to a User before opening a transaction', async () => {
    const { prisma, service } = fixture();

    await expect(service.list({ ...administrator, profile: 'User' })).rejects.toThrow(
      'Access denied',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('CollaboratorLifecycleService transitions', () => {
  function transitionFixture(status: 'ACTIVE' | 'SUSPENDED' | 'REMOVED', claimed = true) {
    const tx = {
      $executeRaw: vi.fn(),
      membership: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'target-membership-id',
            identityId: 'target-identity-id',
            status,
            version: 3,
            ownership: null,
          })
          .mockResolvedValue({ id: administrator.membershipId }),
        updateMany: vi.fn().mockResolvedValue({ count: claimed ? 1 : 0 }),
      },
      authSession: { updateMany: vi.fn() },
      ownershipTransferProposal: { updateMany: vi.fn() },
      auditEvidence: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    return { service: new CollaboratorLifecycleService(prisma as never, {} as never), tx };
  }

  it('reactivates only a suspended collaborator', async () => {
    const { service, tx } = transitionFixture('SUSPENDED');

    await expect(
      service.reactivate(administrator, 'target-membership-id', 'Access restored', true),
    ).resolves.toEqual({ id: 'target-membership-id', status: 'ACTIVE', version: 4 });
    expect(tx.membership.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'target-membership-id', status: 'SUSPENDED', version: 3 },
      }),
    );
    expect(tx.ownershipTransferProposal.updateMany).not.toHaveBeenCalled();
  });

  it('cancels a pending successor proposal when suspending the collaborator', async () => {
    const { service, tx } = transitionFixture('ACTIVE');

    await service.suspend(administrator, 'target-membership-id', 'Security review', true);

    expect(tx.ownershipTransferProposal.updateMany).toHaveBeenCalledWith({
      where: { successorMembershipId: 'target-membership-id', status: 'PENDING' },
      data: { status: 'CANCELLED', cancelledAt: expect.any(Date) },
    });
  });

  it('requires a new invitation instead of directly reactivating removed history', async () => {
    const { service, tx } = transitionFixture('REMOVED');

    await expect(
      service.reactivate(administrator, 'target-membership-id', 'Attempted restore', true),
    ).rejects.toThrow('must return through a new invitation');
    expect(tx.membership.updateMany).not.toHaveBeenCalled();
  });

  it('does not suspend an already suspended collaborator through a different transition', async () => {
    const { service, tx } = transitionFixture('SUSPENDED');

    await expect(
      service.suspend(administrator, 'target-membership-id', 'Duplicate suspension', true),
    ).resolves.toEqual({ id: 'target-membership-id', status: 'SUSPENDED' });
    expect(tx.membership.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a lifecycle transition that lost a concurrent status/version claim', async () => {
    const { service, tx } = transitionFixture('ACTIVE', false);

    await expect(
      service.remove(administrator, 'target-membership-id', 'Employment ended', true),
    ).rejects.toThrow('lifecycle changed; refresh and retry');
    expect(tx.authSession.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvidence.create).not.toHaveBeenCalled();
  });
});

describe('CollaboratorLifecycleService.replaceGrants', () => {
  function grantsFixture(claimed = true) {
    const target = {
      id: 'target-membership-id',
      identityId: 'target-identity-id',
      version: 4,
      organizationWideAccess: true,
      ownership: null,
      capabilityGrants: [{ capability: 'companies.read' }],
      companyGrants: [{ companyId: 'old-company-id' }],
      businessScopeGrants: [{ businessScopeId: 'old-scope-id' }],
    };
    const tx = {
      $executeRaw: vi.fn(),
      membership: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(target)
          .mockResolvedValue({ id: administrator.membershipId }),
        updateMany: vi.fn().mockResolvedValue({ count: claimed ? 1 : 0 }),
      },
      company: { count: vi.fn().mockResolvedValue(1) },
      businessScope: { count: vi.fn().mockResolvedValue(1) },
      capabilityGrant: { deleteMany: vi.fn(), createMany: vi.fn() },
      companyGrant: { deleteMany: vi.fn(), createMany: vi.fn() },
      businessScopeGrant: { deleteMany: vi.fn(), createMany: vi.fn() },
      authSession: { updateMany: vi.fn() },
      auditEvidence: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    return { service: new CollaboratorLifecycleService(prisma as never, {} as never), tx };
  }

  it('atomically claims the expected version and records the complete before and after evidence', async () => {
    const { service, tx } = grantsFixture();

    await expect(
      service.replaceGrants(administrator, 'target-membership-id', {
        capabilities: ['business_scopes.read'],
        companyIds: ['new-company-id'],
        businessScopeIds: ['new-scope-id'],
        organizationWideAccess: false,
        expectedVersion: 4,
        reason: 'Narrow operational access',
        confirmed: true,
      }),
    ).resolves.toMatchObject({ version: 5, organizationWideAccess: false });

    expect(tx.membership.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'target-membership-id', version: 4 } }),
    );
    expect(tx.auditEvidence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        before: {
          version: 4,
          capabilities: ['companies.read'],
          companyIds: ['old-company-id'],
          businessScopeIds: ['old-scope-id'],
          organizationWideAccess: true,
        },
        after: expect.objectContaining({ version: 5, organizationWideAccess: false }),
      }),
    });
    expect(tx.authSession.updateMany).toHaveBeenCalled();
  });

  it('rejects a stale administrator submission before replacing any grants', async () => {
    const { service, tx } = grantsFixture(false);

    await expect(
      service.replaceGrants(administrator, 'target-membership-id', {
        capabilities: [],
        companyIds: ['new-company-id'],
        businessScopeIds: ['new-scope-id'],
        organizationWideAccess: false,
        expectedVersion: 3,
        reason: 'Stale edit',
        confirmed: true,
      }),
    ).rejects.toThrow('refresh and retry');

    expect(tx.capabilityGrant.deleteMany).not.toHaveBeenCalled();
    expect(tx.authSession.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvidence.create).not.toHaveBeenCalled();
  });
});
