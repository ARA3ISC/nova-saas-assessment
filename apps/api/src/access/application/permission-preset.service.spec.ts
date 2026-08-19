import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { EffectiveAccess } from './access.service';
import { PermissionPresetService } from './permission-preset.service';

const access: EffectiveAccess = {
  identityId: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-000000000002',
  membershipId: '00000000-0000-4000-8000-000000000003',
  profile: 'Administrator',
  accessEpoch: 4,
};

function createFixture() {
  const preset = {
    id: '00000000-0000-4000-8000-000000000004',
    key: 'READ_ONLY',
    label: 'Read-only',
    version: 3,
    capabilities: ['companies.read', 'business_scopes.read'],
  };
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    capabilityDefinition: { count: vi.fn().mockResolvedValue(2) },
    permissionPresetVersion: {
      findFirst: vi.fn().mockResolvedValue({ version: 2 }),
      create: vi.fn().mockResolvedValue(preset),
    },
    auditEvidence: { create: vi.fn().mockResolvedValue({}) },
    membership: { findFirst: vi.fn().mockResolvedValue({ id: access.membershipId }) },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return { service: new PermissionPresetService(prisma as never), preset, tx };
}

describe('PermissionPresetService.createVersion', () => {
  it('creates the next immutable version and records evidence', async () => {
    const { service, preset, tx } = createFixture();

    await expect(
      service.createVersion(access, {
        key: ' read_only ',
        label: ' Read-only ',
        capabilities: ['companies.read', 'business_scopes.read', 'companies.read'],
        reason: ' Refresh the standard preset ',
        confirmed: true,
      }),
    ).resolves.toEqual(preset);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(5);
    expect(tx.permissionPresetVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: access.organizationId,
          key: 'READ_ONLY',
          label: 'Read-only',
          version: 3,
          capabilities: ['companies.read', 'business_scopes.read'],
        }),
      }),
    );
    expect(tx.auditEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PERMISSION_PRESET_VERSION_CREATED',
          reason: 'Refresh the standard preset',
          subjectId: preset.id,
        }),
      }),
    );
  });

  it('rejects non-administrators', async () => {
    const { service } = createFixture();
    await expect(
      service.createVersion(
        { ...access, profile: 'User' },
        {
          key: 'READ_ONLY',
          label: 'Read-only',
          capabilities: ['companies.read'],
          reason: 'Attempt',
          confirmed: true,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects unknown capabilities before persistence', async () => {
    const { service, tx } = createFixture();
    await expect(
      service.createVersion(access, {
        key: 'READ_ONLY',
        label: 'Read-only',
        capabilities: ['platform.organizations.manage'],
        reason: 'Attempt',
        confirmed: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.permissionPresetVersion.create).not.toHaveBeenCalled();
  });
});

describe('PermissionPresetService.resolve', () => {
  it('resolves the exact selected immutable version by id', async () => {
    const { service, tx } = createFixture();
    tx.permissionPresetVersion.findFirst.mockResolvedValue({ capabilities: ['companies.read'] });

    await expect(service.resolve(tx as never, 'preset-version-id')).resolves.toEqual([
      'companies.read',
    ]);
    expect(tx.permissionPresetVersion.findFirst).toHaveBeenCalledWith({
      where: { id: 'preset-version-id', active: true },
      select: { capabilities: true },
    });
  });
});
