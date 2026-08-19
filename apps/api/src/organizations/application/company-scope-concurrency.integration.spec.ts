import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OrganizationAdminService } from './organization-admin.service';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

describe('Company and Business Scope lifecycle concurrency', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('never leaves an inactive Company with a concurrently-created active scope', async () => {
    const organizationId = randomUUID();
    const identityId = randomUUID();
    const membershipId = randomUUID();
    const companyId = randomUUID();
    await prisma.identity.create({
      data: {
        id: identityId,
        email: `${identityId}@example.test`,
        normalizedEmail: `${identityId}@example.test`,
      },
    });
    await prisma.organization.create({
      data: { id: organizationId, name: 'Scope race organization', accessStatus: 'PROVISIONING' },
    });
    await prisma.$transaction(async (tx) => {
      await tx.membership.create({
        data: { id: membershipId, organizationId, identityId, profile: 'Administrator' },
      });
      await tx.organizationOwnership.create({ data: { organizationId, membershipId } });
      await tx.organization.update({
        where: { id: organizationId },
        data: { accessStatus: 'ACTIVE' },
      });
    });
    await prisma.company.create({
      data: { id: companyId, organizationId, name: `Concurrent Company ${companyId}` },
    });

    try {
      const service = new OrganizationAdminService(prisma as never);
      const access = {
        identityId,
        organizationId,
        membershipId,
        profile: 'Administrator' as const,
        accessEpoch: 0,
      };
      const outcomes = await Promise.allSettled([
        service.deactivateCompany(access, companyId, 'Concurrent lifecycle test', true),
        service.createBusinessScope(access, {
          companyId,
          type: 'EVENT',
          name: `Concurrent Scope ${randomUUID()}`,
          confirmed: true,
        }),
      ]);

      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
      const company = await prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { status: true },
      });
      const activeScopeCount = await prisma.businessScope.count({
        where: { companyId, status: 'ACTIVE' },
      });
      expect(company.status === 'ACTIVE' || activeScopeCount === 0).toBe(true);

      if (company.status === 'INACTIVE') {
        await prisma.company.update({ where: { id: companyId }, data: { status: 'ACTIVE' } });
      }
      if (activeScopeCount === 0) {
        const scopeName = `Database Guard Scope ${randomUUID()}`;
        await prisma.businessScope.create({
          data: {
            organizationId,
            companyId,
            type: 'EVENT',
            name: scopeName,
            normalizedName: scopeName.toLowerCase(),
          },
        });
      }
      await expect(
        prisma.company.update({ where: { id: companyId }, data: { status: 'INACTIVE' } }),
      ).rejects.toThrow('company with active business scopes cannot be deactivated');

      await prisma.businessScope.updateMany({
        where: { companyId },
        data: { status: 'INACTIVE' },
      });
      await prisma.company.update({ where: { id: companyId }, data: { status: 'INACTIVE' } });
      const invalidScopeName = `Invalid Parent Scope ${randomUUID()}`;
      await expect(
        prisma.businessScope.create({
          data: {
            organizationId,
            companyId,
            type: 'EVENT',
            name: invalidScopeName,
            normalizedName: invalidScopeName.toLowerCase(),
          },
        }),
      ).rejects.toThrow('active business scope requires an active parent company');
    } finally {
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.identity.deleteMany({ where: { id: identityId } });
    }
  });
});
