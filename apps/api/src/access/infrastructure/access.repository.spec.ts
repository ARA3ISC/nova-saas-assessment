import { describe, expect, it, vi } from 'vitest';

import { AccessRepository } from './access.repository';

describe('AccessRepository effective grant filtering', () => {
  it('fails closed for inactive, platform-only, and inactive-scope grants', async () => {
    const prisma = {
      membership: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'membership-id',
          capabilityGrants: [
            { capability: 'companies.read' },
            { capability: 'inactive.read' },
            { capability: 'platform.manage' },
          ],
          companyGrants: [
            { companyId: 'company-active', company: { status: 'ACTIVE' } },
            { companyId: 'company-inactive', company: { status: 'INACTIVE' } },
          ],
          businessScopeGrants: [
            {
              businessScopeId: 'scope-active',
              businessScope: { status: 'ACTIVE', company: { status: 'ACTIVE' } },
            },
            {
              businessScopeId: 'scope-inactive',
              businessScope: { status: 'INACTIVE', company: { status: 'ACTIVE' } },
            },
            {
              businessScopeId: 'scope-parent-inactive',
              businessScope: { status: 'ACTIVE', company: { status: 'INACTIVE' } },
            },
          ],
        }),
      },
      capabilityDefinition: {
        findMany: vi.fn().mockResolvedValue([{ key: 'companies.read' }]),
      },
    };

    const result = await new AccessRepository(prisma as never).findEffectiveAccess('identity-id');

    expect(prisma.capabilityDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ active: true, platformOnly: false }),
      }),
    );
    expect(result).toMatchObject({
      capabilityGrants: [{ capability: 'companies.read' }],
      companyGrants: [{ companyId: 'company-active', company: { status: 'ACTIVE' } }],
      businessScopeGrants: [
        {
          businessScopeId: 'scope-active',
          businessScope: { status: 'ACTIVE', company: { status: 'ACTIVE' } },
        },
      ],
    });
  });
});
