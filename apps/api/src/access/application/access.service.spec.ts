import { describe, expect, it, vi } from 'vitest';

import { AccessService } from './access.service';

describe('AccessService', () => {
  function createRepository() {
    return {
      findEffectiveAccess: vi.fn(),
    };
  }

  it('resolves effective access for an active member', async () => {
    const repository = createRepository();

    repository.findEffectiveAccess.mockResolvedValue({
      id: 'membership-id',
      identityId: 'identity-id',
      organizationId: 'organization-id',
      profile: 'Administrator',
      status: 'ACTIVE',
      accessEpoch: 3,
      organizationWideAccess: false,
      identity: {
        id: 'identity-id',
        status: 'ACTIVE',
      },
      organization: {
        id: 'organization-id',
        accessStatus: 'ACTIVE',
      },
    });

    const service = new AccessService(
      repository as unknown as ConstructorParameters<typeof AccessService>[0],
    );

    await expect(service.resolveEffectiveAccess('identity-id')).resolves.toEqual({
      identityId: 'identity-id',
      organizationId: 'organization-id',
      membershipId: 'membership-id',
      profile: 'Administrator',
      accessEpoch: 3,
      organizationWideAccess: false,
      capabilities: [],
      companyIds: [],
      businessScopeIds: [],
    });

    expect(repository.findEffectiveAccess).toHaveBeenCalledOnce();

    expect(repository.findEffectiveAccess).toHaveBeenCalledWith('identity-id');
  });

  it('rejects an identity without a membership', async () => {
    const repository = createRepository();

    repository.findEffectiveAccess.mockResolvedValue(null);

    const service = new AccessService(
      repository as unknown as ConstructorParameters<typeof AccessService>[0],
    );

    await expect(service.resolveEffectiveAccess('identity-id')).rejects.toThrow('Access denied');
  });

  it('rejects a disabled identity', async () => {
    const repository = createRepository();

    repository.findEffectiveAccess.mockResolvedValue({
      id: 'membership-id',
      identityId: 'identity-id',
      organizationId: 'organization-id',
      profile: 'User',
      status: 'ACTIVE',
      accessEpoch: 1,
      identity: {
        id: 'identity-id',
        status: 'DISABLED',
      },
      organization: {
        id: 'organization-id',
        accessStatus: 'ACTIVE',
      },
    });

    const service = new AccessService(
      repository as unknown as ConstructorParameters<typeof AccessService>[0],
    );

    await expect(service.resolveEffectiveAccess('identity-id')).rejects.toThrow('Access denied');
  });

  it('rejects a suspended membership', async () => {
    const repository = createRepository();

    repository.findEffectiveAccess.mockResolvedValue({
      id: 'membership-id',
      identityId: 'identity-id',
      organizationId: 'organization-id',
      profile: 'User',
      status: 'SUSPENDED',
      accessEpoch: 4,
      identity: {
        id: 'identity-id',
        status: 'ACTIVE',
      },
      organization: {
        id: 'organization-id',
        accessStatus: 'ACTIVE',
      },
    });

    const service = new AccessService(
      repository as unknown as ConstructorParameters<typeof AccessService>[0],
    );

    await expect(service.resolveEffectiveAccess('identity-id')).rejects.toThrow('Access denied');
  });

  it('rejects an inaccessible organization', async () => {
    const repository = createRepository();

    repository.findEffectiveAccess.mockResolvedValue({
      id: 'membership-id',
      identityId: 'identity-id',
      organizationId: 'organization-id',
      profile: 'User',
      status: 'ACTIVE',
      accessEpoch: 4,
      identity: {
        id: 'identity-id',
        status: 'ACTIVE',
      },
      organization: {
        id: 'organization-id',
        accessStatus: 'SUSPENDED',
      },
    });

    const service = new AccessService(
      repository as unknown as ConstructorParameters<typeof AccessService>[0],
    );

    await expect(service.resolveEffectiveAccess('identity-id')).rejects.toThrow('Access denied');
  });
});
