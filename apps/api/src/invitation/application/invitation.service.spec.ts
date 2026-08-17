import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { InvitationService } from './invitation.service';
import type { InvitationRepository } from '../infrastructure/invitation.repository';

function createRepository() {
  return {
    create: vi.fn(),
    findValidToken: vi.fn(),
    findByOrganizationEmailAndKind: vi.fn(),
    consume: vi.fn(),
    revoke: vi.fn(),
    revokePendingForOrganizationEmailAndKind: vi.fn(),
  };
}

describe('InvitationService', () => {
  it('creates an invitation and returns the raw token', async () => {
    const repository = createRepository();

    repository
      .findByOrganizationEmailAndKind
      .mockResolvedValue(null);

    repository.create.mockResolvedValue({
      id: 'invitation-id',
      organizationId: 'organization-id',
      email: 'user@example.com',
      normalizedEmail: 'user@example.com',
      tokenHash: 'hashed-token',
      kind: 'COLLABORATOR',
      targetProfile: 'User',
      expiresAt: new Date(
        '2026-08-24T12:00:00.000Z',
      ),
    });

    const service = new InvitationService(
      repository as unknown as InvitationRepository,
    );

    const result =
      await service.createInvitation({
        organizationId: 'organization-id',
        email: ' USER@example.com ',
        kind: 'COLLABORATOR',
        targetProfile: 'User',
      });

    expect(result.id).toBe('invitation-id');
    expect(result.token).toBeTruthy();
    expect(result.expiresAt).toEqual(
      new Date('2026-08-24T12:00:00.000Z'),
    );

    expect(
      repository.create,
    ).toHaveBeenCalledOnce();

    const createCall =
      repository.create.mock.calls[0]?.[0];

    expect(createCall.organizationId).toBe(
      'organization-id',
    );
    expect(createCall.email).toBe(
      'USER@example.com',
    );
    expect(createCall.normalizedEmail).toBe(
      'user@example.com',
    );
    expect(createCall.tokenHash).toBeTruthy();
    expect(createCall.tokenHash).not.toBe(
      result.token,
    );
  });

  it('rejects duplicate active invitations', async () => {
    const repository = createRepository();

    repository
      .findByOrganizationEmailAndKind
      .mockResolvedValue({
        id: 'existing-id',
        consumedAt: null,
        revokedAt: null,
        expiresAt: new Date(
          Date.now() + 60_000,
        ),
      });

    const service = new InvitationService(
      repository as unknown as InvitationRepository,
    );

    await expect(
      service.createInvitation({
        organizationId: 'organization-id',
        email: 'user@example.com',
        kind: 'COLLABORATOR',
        targetProfile: 'User',
      }),
    ).rejects.toThrow(
      'An active invitation already exists',
    );

    expect(
      repository.create,
    ).not.toHaveBeenCalled();
  });

  it('revokes an old invitation before creating a replacement', async () => {
    const repository = createRepository();

    repository
      .findByOrganizationEmailAndKind
      .mockResolvedValue({
        id: 'old-invitation',
        consumedAt: null,
        revokedAt: new Date(),
        expiresAt: new Date(
          Date.now() - 60_000,
        ),
      });

    repository.create.mockResolvedValue({
      id: 'new-invitation',
      expiresAt: new Date(
        Date.now() + 60_000,
      ),
    });

    const service = new InvitationService(
      repository as unknown as InvitationRepository,
    );

    await service.createInvitation({
      organizationId: 'organization-id',
      email: 'user@example.com',
      kind: 'COLLABORATOR',
      targetProfile: 'User',
    });

    expect(
      repository.revoke,
    ).toHaveBeenCalledWith(
      'old-invitation',
    );

    expect(
      repository.create,
    ).toHaveBeenCalledOnce();
  });

  it('consumes a valid invitation', async () => {
    const repository = createRepository();

    repository.findValidToken.mockResolvedValue({
      id: 'invitation-id',
      organizationId: 'organization-id',
      email: 'user@example.com',
      kind: 'COLLABORATOR',
      targetProfile: 'User',
    });

    const service = new InvitationService(
      repository as unknown as InvitationRepository,
    );

    const result =
      await service.consumeInvitation(
        'raw-token',
      );

    expect(result).toEqual({
      id: 'invitation-id',
      organizationId: 'organization-id',
      email: 'user@example.com',
      kind: 'COLLABORATOR',
      targetProfile: 'User',
    });

    expect(
      repository.consume,
    ).toHaveBeenCalledWith(
      'invitation-id',
    );
  });

  it('returns null for an invalid or expired invitation', async () => {
    const repository = createRepository();

    repository.findValidToken.mockResolvedValue(
      null,
    );

    const service = new InvitationService(
      repository as unknown as InvitationRepository,
    );

    await expect(
      service.consumeInvitation(
        'invalid-token',
      ),
    ).resolves.toBeNull();

    expect(
      repository.consume,
    ).not.toHaveBeenCalled();
  });

  it('revokes an invitation', async () => {
    const repository = createRepository();

    const service = new InvitationService(
      repository as unknown as InvitationRepository,
    );

    await service.revokeInvitation(
      'invitation-id',
    );

    expect(
      repository.revoke,
    ).toHaveBeenCalledWith(
      'invitation-id',
    );
  });
});
