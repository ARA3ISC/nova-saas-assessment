import { describe, expect, it, vi } from 'vitest';
import { OrganizationAdminService } from './organization-admin.service';

describe('OrganizationAdminService', () => {
  const admin = {
    identityId: 'identity-id',
    organizationId: 'organization-id',
    membershipId: 'membership-id',
    profile: 'Administrator' as const,
    accessEpoch: 0,
  };
  function prisma() {
    const tx = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
      organization: { findFirst: vi.fn() },
      company: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      businessScope: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      membership: { findFirst: vi.fn().mockResolvedValue({ id: 'membership-id' }) },
      auditEvidence: { create: vi.fn() },
    };
    return {
      $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
      tx,
    };
  }

  it('refuses Company administration by a User', async () => {
    const db = prisma();
    const service = new OrganizationAdminService(db as never);
    await expect(service.createCompany({ ...admin, profile: 'User' }, 'Acme')).rejects.toThrow(
      'Access denied',
    );
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('blocks Company deactivation while active scopes exist', async () => {
    const db = prisma();
    db.tx.$queryRaw.mockResolvedValue([{ id: 'company-id', status: 'ACTIVE' }]);
    db.tx.businessScope.findMany.mockResolvedValue([
      { name: 'Casablanca Venue' },
      { name: 'Rabat Venue' },
    ]);
    const service = new OrganizationAdminService(db as never);
    await expect(
      service.deactivateCompany(admin, 'company-id', 'Required lifecycle action', true),
    ).rejects.toThrow(
      'Deactivate these active Business Scopes first: Casablanca Venue, Rabat Venue. Then retry Company deactivation.',
    );
    expect(db.tx.company.update).not.toHaveBeenCalled();
  });

  it('creates a normalized scope under an active Company in the current organization', async () => {
    const db = prisma();
    db.tx.$queryRaw.mockResolvedValue([{ id: 'company-id', status: 'ACTIVE' }]);
    db.tx.businessScope.create.mockResolvedValue({ id: 'scope-id' });
    const service = new OrganizationAdminService(db as never);
    await service.createBusinessScope(admin, {
      companyId: 'company-id',
      type: 'RESTAURANT',
      name: ' Main Café ',
      externalIdentifier: ' ext-1 ',
      location: ' Casablanca ',
      responsiblePerson: ' Demo Operator ',
      sectorCounterpart: ' Restaurant Operator ',
      confirmed: true,
    });
    expect(db.tx.businessScope.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'organization-id',
          companyId: 'company-id',
          normalizedName: 'main café',
          externalIdentifier: 'ext-1',
          normalizedExternalIdentifier: 'ext-1',
          location: 'Casablanca',
          responsiblePerson: 'Demo Operator',
          sectorCounterpart: 'Restaurant Operator',
        }),
      }),
    );
    expect(db.tx.auditEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'BUSINESS_SCOPE_CREATED',
          actorId: 'identity-id',
          after: expect.objectContaining({ source: 'MANUAL' }),
        }),
      }),
    );
  });

  it('rejects a stale Company rename before writing audit evidence', async () => {
    const db = prisma();
    db.tx.company.findFirst.mockResolvedValue({ id: 'company-id', name: 'Current', version: 4 });
    const service = new OrganizationAdminService(db as never);

    await expect(service.renameCompany(admin, 'company-id', 'Stale name', 3)).rejects.toThrow(
      'Company changed; refresh and retry',
    );
    expect(db.tx.company.updateMany).not.toHaveBeenCalled();
    expect(db.tx.auditEvidence.create).not.toHaveBeenCalled();
  });

  it('requires final confirmation before creating a Business Scope', async () => {
    const db = prisma();
    const service = new OrganizationAdminService(db as never);

    await expect(
      service.createBusinessScope(admin, {
        companyId: 'company-id',
        type: 'RESTAURANT',
        name: 'Main Café',
        confirmed: false,
      }),
    ).rejects.toThrow('Explicit confirmation is required');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('refuses to reactivate a scope while its parent Company is inactive', async () => {
    const db = prisma();
    db.tx.businessScope.findFirst.mockResolvedValue({
      id: 'scope-id',
      status: 'INACTIVE',
      companyId: 'company-id',
    });
    db.tx.$queryRaw.mockResolvedValue([{ id: 'company-id', status: 'INACTIVE' }]);
    const service = new OrganizationAdminService(db as never);

    await expect(
      service.reactivateBusinessScope(admin, 'scope-id', 'Operations resumed', true),
    ).rejects.toThrow('Reactivate the parent Company first');
    expect(db.tx.businessScope.update).not.toHaveBeenCalled();
  });

  it('updates the complete Business Scope identity with normalized duplicate fields', async () => {
    const db = prisma();
    db.tx.businessScope.findFirst.mockResolvedValue({
      id: 'scope-id',
      name: 'Old scope',
      version: 2,
    });
    db.tx.businessScope.updateMany.mockResolvedValue({ count: 1 });
    const service = new OrganizationAdminService(db as never);

    await service.updateBusinessScope(admin, 'scope-id', {
      type: 'EVENT',
      name: ' Main Venue ',
      externalIdentifier: ' EVT-1 ',
      location: ' Rabat ',
      responsiblePerson: ' Demo Lead ',
      sectorCounterpart: ' Organizer ',
      expectedVersion: 2,
    });

    expect(db.tx.businessScope.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'scope-id', version: 2 },
        data: expect.objectContaining({
          type: 'EVENT',
          name: 'Main Venue',
          normalizedName: 'main venue',
          externalIdentifier: 'EVT-1',
          normalizedExternalIdentifier: 'evt-1',
          location: 'Rabat',
          responsiblePerson: 'Demo Lead',
          sectorCounterpart: 'Organizer',
          version: { increment: 1 },
        }),
      }),
    );
    expect(db.tx.auditEvidence.create).toHaveBeenCalled();
  });

  it('limits Company search to a User’s explicit Company grants', async () => {
    const db = prisma();
    db.tx.organization.findFirst.mockResolvedValue(null);
    db.tx.company.findMany.mockResolvedValue([]);
    const service = new OrganizationAdminService(db as never);

    await service.listCompanies(
      {
        ...admin,
        profile: 'User',
        capabilities: ['companies.read'],
        companyIds: ['company-a'],
      },
      'atlas',
    );

    expect(db.tx.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 50,
        where: {
          id: { in: ['company-a'] },
          name: { contains: 'atlas', mode: 'insensitive' },
        },
      }),
    );
  });

  it('lets an Organization-scoped User search every current tenant Company', async () => {
    const db = prisma();
    db.tx.organization.findFirst.mockResolvedValue(null);
    db.tx.company.findMany.mockResolvedValue([]);
    const service = new OrganizationAdminService(db as never);

    await service.listCompanies(
      {
        ...admin,
        profile: 'User',
        capabilities: ['companies.read'],
        companyIds: [],
        organizationWideAccess: true,
      },
      'atlas',
    );

    expect(db.tx.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { contains: 'atlas', mode: 'insensitive' } },
      }),
    );
  });

  it('searches authorized scopes by their parent Company name', async () => {
    const db = prisma();
    db.tx.organization.findFirst.mockResolvedValue(null);
    db.tx.businessScope.findMany.mockResolvedValue([]);
    const service = new OrganizationAdminService(db as never);

    await service.listBusinessScopes(
      {
        ...admin,
        profile: 'User',
        capabilities: ['business_scopes.read'],
        businessScopeIds: ['scope-a'],
        companyIds: [],
      },
      'hospitality',
    );

    expect(db.tx.businessScope.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 50,
        where: expect.objectContaining({
          OR: [{ id: { in: ['scope-a'] } }, { companyId: { in: [] } }],
          AND: [
            {
              OR: expect.arrayContaining([
                { company: { name: { contains: 'hospitality', mode: 'insensitive' } } },
              ]),
            },
          ],
        }),
      }),
    );
  });
});
