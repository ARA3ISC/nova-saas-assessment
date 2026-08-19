import { describe, expect, it, vi } from 'vitest';

import { InitialOwnerAcceptanceService } from './initial-owner-acceptance.service';

describe('InitialOwnerAcceptanceService', () => {
  function createPrisma() {
    const transaction = {
      invitation: { findFirst: vi.fn(), updateMany: vi.fn() },
      organization: { findFirst: vi.fn(), updateMany: vi.fn() },
      identity: { findUnique: vi.fn(), create: vi.fn() },
      membership: { create: vi.fn() },
      organizationOwnership: { create: vi.fn() },
      auditEvidence: { create: vi.fn() },
    };

    return {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
      transaction,
    };
  }

  function setValidInvitation(prisma: ReturnType<typeof createPrisma>) {
    prisma.transaction.invitation.findFirst.mockResolvedValue({
      id: 'invitation-id',
      organizationId: 'organization-id',
      email: 'owner@example.com',
      normalizedEmail: 'owner@example.com',
    });
    prisma.transaction.organization.findFirst.mockResolvedValue({ id: 'organization-id' });
    prisma.transaction.identity.findUnique.mockResolvedValue(null);
    prisma.transaction.invitation.updateMany.mockResolvedValue({ count: 1 });
    prisma.transaction.identity.create.mockResolvedValue({ id: 'identity-id' });
    prisma.transaction.membership.create.mockResolvedValue({ id: 'membership-id' });
    prisma.transaction.organizationOwnership.create.mockResolvedValue({ id: 'ownership-id' });
    prisma.transaction.organization.updateMany.mockResolvedValue({ count: 1 });
  }

  it('atomically creates the owner and activates the provisioning organization', async () => {
    const prisma = createPrisma();
    setValidInvitation(prisma);
    const service = new InitialOwnerAcceptanceService(prisma as never);

    await expect(
      service.accept({ token: 'invitation-token', password: 'a compliant password' }),
    ).resolves.toEqual({ organizationId: 'organization-id' });

    expect(prisma.transaction.identity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'owner@example.com',
          normalizedEmail: 'owner@example.com',
          passwordCredential: { create: { passwordHash: expect.any(String) } },
        }),
      }),
    );
    expect(prisma.transaction.membership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'organization-id',
          identityId: 'identity-id',
          profile: 'Administrator',
          status: 'ACTIVE',
        }),
      }),
    );
    expect(prisma.transaction.organizationOwnership.create).toHaveBeenCalledWith({
      data: { organizationId: 'organization-id', membershipId: 'membership-id' },
    });
    expect(prisma.transaction.organization.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'organization-id', accessStatus: 'PROVISIONING' },
        data: { accessStatus: 'ACTIVE' },
      }),
    );
    expect(prisma.transaction.auditEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'INITIAL_OWNER_INVITATION_ACCEPTED',
          actorId: 'identity-id',
          subjectId: 'invitation-id',
        }),
      }),
    );
  });

  it('does not mutate records for an invalid, expired, revoked, or consumed token', async () => {
    const prisma = createPrisma();
    prisma.transaction.invitation.findFirst.mockResolvedValue(null);
    const service = new InitialOwnerAcceptanceService(prisma as never);

    await expect(
      service.accept({ token: 'invalid-token', password: 'a compliant password' }),
    ).resolves.toBeNull();

    expect(prisma.transaction.invitation.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.identity.create).not.toHaveBeenCalled();
    expect(prisma.transaction.organization.updateMany).not.toHaveBeenCalled();
  });

  it('does not consume the invitation when the matching identity already exists', async () => {
    const prisma = createPrisma();
    setValidInvitation(prisma);
    prisma.transaction.identity.findUnique.mockResolvedValue({ id: 'identity-id' });
    const service = new InitialOwnerAcceptanceService(prisma as never);

    await expect(
      service.accept({ token: 'invitation-token', password: 'a compliant password' }),
    ).resolves.toBeNull();

    expect(prisma.transaction.invitation.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.identity.create).not.toHaveBeenCalled();
  });

  it('refuses a concurrently consumed invitation before creating any identity', async () => {
    const prisma = createPrisma();
    setValidInvitation(prisma);
    prisma.transaction.invitation.updateMany.mockResolvedValue({ count: 0 });
    const service = new InitialOwnerAcceptanceService(prisma as never);

    await expect(
      service.accept({ token: 'invitation-token', password: 'a compliant password' }),
    ).resolves.toBeNull();

    expect(prisma.transaction.identity.create).not.toHaveBeenCalled();
    expect(prisma.transaction.membership.create).not.toHaveBeenCalled();
    expect(prisma.transaction.organizationOwnership.create).not.toHaveBeenCalled();
  });
});
