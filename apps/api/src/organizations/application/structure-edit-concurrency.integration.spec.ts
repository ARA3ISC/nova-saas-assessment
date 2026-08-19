import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OrganizationAdminService } from './organization-admin.service';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

describe('Company and Business Scope edit concurrency', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('rejects stale Company and Business Scope edits instead of losing updates', async () => {
    const organizationId = randomUUID();
    const identityId = randomUUID();
    const membershipId = randomUUID();
    const companyId = randomUUID();
    const scopeId = randomUUID();
    await prisma.identity.create({
      data: {
        id: identityId,
        email: `${identityId}@example.test`,
        normalizedEmail: `${identityId}@example.test`,
      },
    });
    await prisma.organization.create({
      data: { id: organizationId, name: `Edit ${organizationId}`, accessStatus: 'PROVISIONING' },
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
      data: { id: companyId, organizationId, name: `Original Company ${companyId}` },
    });
    await prisma.businessScope.create({
      data: {
        id: scopeId,
        organizationId,
        companyId,
        type: 'EVENT',
        name: `Original Scope ${scopeId}`,
        normalizedName: `original scope ${scopeId}`,
      },
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
      const companyOutcomes = await Promise.allSettled([
        service.renameCompany(access, companyId, `Company Alpha ${companyId}`, 1),
        service.renameCompany(access, companyId, `Company Beta ${companyId}`, 1),
      ]);
      expect(companyOutcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      expect(companyOutcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
      await expect(
        prisma.company.findUnique({ where: { id: companyId }, select: { version: true } }),
      ).resolves.toEqual({ version: 2 });
      const currentCompany = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
      await expect(service.createCompany(access, currentCompany.name)).rejects.toThrow(
        'A Company with this name already exists',
      );

      const scopeParams = (name: string) => ({
        type: 'EVENT' as const,
        name,
        location: 'Synthetic edit location',
        expectedVersion: 1,
      });
      const scopeOutcomes = await Promise.allSettled([
        service.updateBusinessScope(access, scopeId, scopeParams(`Scope Alpha ${scopeId}`)),
        service.updateBusinessScope(access, scopeId, scopeParams(`Scope Beta ${scopeId}`)),
      ]);
      expect(scopeOutcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      expect(scopeOutcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
      await expect(
        prisma.businessScope.findUnique({ where: { id: scopeId }, select: { version: true } }),
      ).resolves.toEqual({ version: 2 });
      await expect(
        prisma.auditEvidence.count({
          where: { organizationId, action: { in: ['COMPANY_UPDATED', 'BUSINESS_SCOPE_UPDATED'] } },
        }),
      ).resolves.toBe(2);
    } finally {
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.identity.deleteMany({ where: { id: identityId } });
    }
  });
});
