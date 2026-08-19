import { describe, expect, it, vi } from 'vitest';
import { InvitationKind, OrganizationProfile } from '@prisma/client';

import { InvitationService } from './invitation.service';

describe('InvitationService', () => {
  function createRepository() {
    return {
      create: vi.fn(),
      findValidToken: vi.fn(),
      findByOrganizationEmail: vi.fn(),
      consume: vi.fn(),
      revoke: vi.fn(),
      revokePendingForOrganizationEmailAndKind: vi.fn(),
    };
  }

  function createService(repository: ReturnType<typeof createRepository>) {
    return new InvitationService(
      repository as unknown as ConstructorParameters<typeof InvitationService>[0],
    );
  }

  const organizationId = 'organization-id';
  const email = 'User@Example.com';
  const normalizedEmail = 'user@example.com';

  it('creates an invitation and returns the raw token', async () => {
    const repository = createRepository();

    repository.findByOrganizationEmail.mockResolvedValue(null);

    repository.create.mockResolvedValue({
      id: 'invitation-id',
      organizationId,
      email,
      normalizedEmail,
      tokenHash: 'hashed-token',
      kind: InvitationKind.COLLABORATOR,
      targetProfile: OrganizationProfile.User,
      expiresAt: new Date('2026-08-24T00:00:00.000Z'),
      consumedAt: null,
      revokedAt: null,
      createdAt: new Date('2026-08-17T00:00:00.000Z'),
      updatedAt: new Date('2026-08-17T00:00:00.000Z'),
    });

    const service = createService(repository);

    const result = await service.createInvitation({
      organizationId,
      email,
      kind: InvitationKind.COLLABORATOR,
      targetProfile: OrganizationProfile.User,
    });

    expect(result.id).toBe('invitation-id');
    expect(result.token).toEqual(expect.any(String));
    expect(result.token.length).toBeGreaterThan(0);
    expect(result.expiresAt).toEqual(new Date('2026-08-24T00:00:00.000Z'));

    expect(repository.findByOrganizationEmail).toHaveBeenCalledWith(
      organizationId,
      normalizedEmail,
    );

    expect(repository.create).toHaveBeenCalledOnce();

    const createParams = repository.create.mock.calls[0]?.[0];

    expect(createParams).toMatchObject({
      organizationId,
      email: email.trim(),
      normalizedEmail,
      kind: InvitationKind.COLLABORATOR,
      targetProfile: OrganizationProfile.User,
    });

    expect(createParams.tokenHash).toEqual(expect.any(String));
    expect(createParams.expiresAt).toEqual(expect.any(Date));
  });

  it('rejects duplicate active invitations', async () => {
    const repository = createRepository();

    repository.findByOrganizationEmail.mockResolvedValue({
      id: 'existing-invitation-id',
      organizationId,
      email,
      normalizedEmail,
      tokenHash: 'existing-token-hash',
      kind: InvitationKind.COLLABORATOR,
      targetProfile: OrganizationProfile.User,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const service = createService(repository);

    await expect(
      service.createInvitation({
        organizationId,
        email,
        kind: InvitationKind.COLLABORATOR,
        targetProfile: OrganizationProfile.User,
      }),
    ).rejects.toThrow('An active invitation already exists');

    expect(repository.create).not.toHaveBeenCalled();

    expect(repository.revoke).not.toHaveBeenCalled();
  });

  it('revokes an old invitation before creating a replacement', async () => {
    const repository = createRepository();

    repository.findByOrganizationEmail.mockResolvedValue({
      id: 'old-invitation-id',
      organizationId,
      email,
      normalizedEmail,
      tokenHash: 'old-token-hash',
      kind: InvitationKind.COLLABORATOR,
      targetProfile: OrganizationProfile.User,
      expiresAt: new Date(Date.now() - 60_000),
      consumedAt: null,
      revokedAt: null,
      createdAt: new Date('2026-08-16T00:00:00.000Z'),
      updatedAt: new Date('2026-08-16T00:00:00.000Z'),
    });

    repository.revoke.mockResolvedValue(undefined);

    repository.create.mockResolvedValue({
      id: 'new-invitation-id',
      organizationId,
      email,
      normalizedEmail,
      tokenHash: 'new-token-hash',
      kind: InvitationKind.COLLABORATOR,
      targetProfile: OrganizationProfile.User,
      expiresAt: new Date('2026-08-24T00:00:00.000Z'),
      consumedAt: null,
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const service = createService(repository);

    const result = await service.createInvitation({
      organizationId,
      email,
      kind: InvitationKind.COLLABORATOR,
      targetProfile: OrganizationProfile.User,
    });

    expect(result.id).toBe('new-invitation-id');

    expect(repository.revoke).toHaveBeenCalledWith('old-invitation-id');

    expect(repository.create).toHaveBeenCalledOnce();
  });

  it('consumes a valid invitation', async () => {
    const repository = createRepository();

    repository.findValidToken.mockResolvedValue({
      id: 'invitation-id',
      organizationId,
      email,
      normalizedEmail,
      tokenHash: 'hashed-token',
      kind: InvitationKind.COLLABORATOR,
      targetProfile: OrganizationProfile.User,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    repository.consume.mockResolvedValue(undefined);

    const service = createService(repository);

    const result = await service.consumeInvitation('raw-invitation-token');

    expect(result).toEqual({
      id: 'invitation-id',
      organizationId,
      email,
      kind: InvitationKind.COLLABORATOR,
      targetProfile: OrganizationProfile.User,
    });

    expect(repository.findValidToken).toHaveBeenCalledOnce();

    expect(repository.findValidToken).toHaveBeenCalledWith(expect.any(String), expect.any(Date));

    expect(repository.consume).toHaveBeenCalledWith('invitation-id');
  });

  it('returns null for an invalid or expired invitation', async () => {
    const repository = createRepository();

    repository.findValidToken.mockResolvedValue(null);

    const service = createService(repository);

    const result = await service.consumeInvitation('invalid-token');

    expect(result).toBeNull();

    expect(repository.consume).not.toHaveBeenCalled();
  });

  it('revokes an invitation', async () => {
    const repository = createRepository();

    repository.revoke.mockResolvedValue(undefined);

    const service = createService(repository);

    await service.revokeInvitation('invitation-id');

    expect(repository.revoke).toHaveBeenCalledWith('invitation-id');
  });
});
