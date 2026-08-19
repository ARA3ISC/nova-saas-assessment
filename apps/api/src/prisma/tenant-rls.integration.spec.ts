import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const ADMIN_DATABASE_URL = DATABASE_URL;

const runtimeDatabaseUrl = new URL(DATABASE_URL);
runtimeDatabaseUrl.username = 'nova_app';
runtimeDatabaseUrl.password = 'nova_app';

const RUNTIME_DATABASE_URL = runtimeDatabaseUrl.toString();

describe('Tenant RLS', () => {
  /*
   * Admin connection:
   * Used only for test setup and verification.
   *
   * Runtime connection:
   * Uses nova_app and is therefore subject to RLS.
   */
  const admin = new PrismaClient({
    datasources: {
      db: {
        url: ADMIN_DATABASE_URL,
      },
    },
  });

  const runtime = new PrismaClient({
    datasources: {
      db: {
        url: RUNTIME_DATABASE_URL,
      },
    },
  });

  const organizationA = '11111111-1111-4111-8111-111111111111';

  const organizationB = '22222222-2222-4222-8222-222222222222';

  const companyA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const businessScopeA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  beforeAll(async () => {
    await admin.$connect();
    await runtime.$connect();

    await admin.organization.upsert({
      where: {
        id: organizationA,
      },
      update: {
        name: 'Organization A',
        accessStatus: 'PROVISIONING',
        commercialStatus: 'ACTIVE',
      },
      create: {
        id: organizationA,
        name: 'Organization A',
        accessStatus: 'PROVISIONING',
        commercialStatus: 'ACTIVE',
      },
    });

    await admin.organization.upsert({
      where: {
        id: organizationB,
      },
      update: {
        name: 'Organization B',
        accessStatus: 'PROVISIONING',
        commercialStatus: 'ACTIVE',
      },
      create: {
        id: organizationB,
        name: 'Organization B',
        accessStatus: 'PROVISIONING',
        commercialStatus: 'ACTIVE',
      },
    });

    await admin.company.upsert({
      where: {
        id: companyA,
      },
      update: {
        organizationId: organizationA,
        name: 'Company A',
        status: 'ACTIVE',
      },
      create: {
        id: companyA,
        organizationId: organizationA,
        name: 'Company A',
        status: 'ACTIVE',
      },
    });

    await admin.businessScope.upsert({
      where: {
        id: businessScopeA,
      },
      update: {
        organizationId: organizationA,
        companyId: companyA,
        type: 'RESTAURANT',
        name: 'Restaurant A',
        normalizedName: 'restaurant-a',
        status: 'ACTIVE',
      },
      create: {
        id: businessScopeA,
        organizationId: organizationA,
        companyId: companyA,
        type: 'RESTAURANT',
        name: 'Restaurant A',
        normalizedName: 'restaurant-a',
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    /*
     * Cleanup must happen through the admin connection because
     * the runtime connection is intentionally restricted by RLS.
     */
    await admin.businessScope.deleteMany({
      where: {
        id: businessScopeA,
      },
    });

    await admin.company.deleteMany({
      where: {
        id: companyA,
      },
    });

    await admin.organization.deleteMany({
      where: {
        id: {
          in: [organizationA, organizationB],
        },
      },
    });

    await runtime.$disconnect();
    await admin.$disconnect();
  });

  it('isolates organization rows according to the transaction context', async () => {
    const result = await runtime.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.organization_id',
          ${organizationA},
          true
        )
      `;

      return tx.organization.findMany({
        orderBy: {
          name: 'asc',
        },
      });
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(organizationA);
    expect(result[0]?.name).toBe('Organization A');
  });

  it('does not expose organizations without a tenant context', async () => {
    const result = await runtime.$transaction(async (tx) => {
      return tx.organization.findMany({
        orderBy: {
          name: 'asc',
        },
      });
    });

    expect(result).toHaveLength(0);
  });

  it('classifies every application table and forces RLS on every tenant-owned table', async () => {
    const tenantTables = new Set([
      'Organization',
      'Membership',
      'OrganizationOwnership',
      'Company',
      'BusinessScope',
      'Invitation',
      'OutboxMessage',
      'OwnershipTransferProposal',
      'CapabilityGrant',
      'CompanyGrant',
      'BusinessScopeGrant',
      'AuditEvidence',
      'PermissionPresetVersion',
    ]);
    const globalTables = new Set([
      'Identity',
      'PasswordCredential',
      'AuthSession',
      'PasswordResetToken',
      'AuthenticationThrottle',
      'PlatformPrincipal',
      'CapabilityDefinition',
      '_prisma_migrations',
    ]);
    const rows = await admin.$queryRaw<
      Array<{
        tableName: string;
        rlsEnabled: boolean;
        rlsForced: boolean;
        ownerName: string;
        policyCount: bigint;
      }>
    >`
      SELECT
        c.relname AS "tableName",
        c.relrowsecurity AS "rlsEnabled",
        c.relforcerowsecurity AS "rlsForced",
        owner.rolname AS "ownerName",
        COUNT(policy.policyname) AS "policyCount"
      FROM pg_class c
      JOIN pg_namespace namespace ON namespace.oid = c.relnamespace
      JOIN pg_roles owner ON owner.oid = c.relowner
      LEFT JOIN pg_policies policy
        ON policy.schemaname = namespace.nspname AND policy.tablename = c.relname
      WHERE namespace.nspname = 'public' AND c.relkind = 'r'
      GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity, owner.rolname
      ORDER BY c.relname
    `;

    expect(rows.map((row) => row.tableName).sort()).toEqual(
      [...tenantTables, ...globalTables].sort(),
    );
    for (const row of rows.filter((candidate) => tenantTables.has(candidate.tableName))) {
      expect(row.rlsEnabled, `${row.tableName} must enable RLS`).toBe(true);
      expect(row.rlsForced, `${row.tableName} must force RLS`).toBe(true);
      expect(row.ownerName, `${row.tableName} must not be runtime-owned`).not.toBe('nova_app');
      expect(Number(row.policyCount), `${row.tableName} must have an RLS policy`).toBeGreaterThan(
        0,
      );
    }
  });

  it('rejects inserting a row for another tenant', async () => {
    const crossTenantOrganization = '33333333-3333-4333-8333-333333333333';

    await expect(
      runtime.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT set_config(
            'app.organization_id',
            ${organizationA},
            true
          )
        `;

        return tx.organization.create({
          data: {
            id: crossTenantOrganization,
            name: 'Should Be Rejected',
            accessStatus: 'ACTIVE',
            commercialStatus: 'ACTIVE',
          },
        });
      }),
    ).rejects.toThrow();

    const organization = await admin.organization.findUnique({
      where: {
        id: crossTenantOrganization,
      },
    });

    expect(organization).toBeNull();
  });

  it('cannot update another tenant row', async () => {
    const result = await runtime.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.organization_id',
          ${organizationA},
          true
        )
      `;

      return tx.organization.updateMany({
        where: {
          id: organizationB,
        },
        data: {
          name: 'Should Not Change',
        },
      });
    });

    expect(result.count).toBe(0);

    const organization = await admin.organization.findUnique({
      where: {
        id: organizationB,
      },
      select: {
        name: true,
      },
    });

    expect(organization?.name).toBe('Organization B');
  });

  it('cannot delete another tenant row', async () => {
    const result = await runtime.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.organization_id',
          ${organizationA},
          true
        )
      `;

      return tx.organization.deleteMany({
        where: {
          id: organizationB,
        },
      });
    });

    expect(result.count).toBe(0);

    const organization = await admin.organization.findUnique({
      where: {
        id: organizationB,
      },
    });

    expect(organization).not.toBeNull();
  });

  it('isolates companies by organization', async () => {
    const result = await runtime.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.organization_id',
          ${organizationA},
          true
        )
      `;

      return tx.company.findMany({
        orderBy: {
          name: 'asc',
        },
      });
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(companyA);
    expect(result[0]?.organizationId).toBe(organizationA);
    expect(result[0]?.name).toBe('Company A');
  });

  it('does not expose companies without a tenant context', async () => {
    const result = await runtime.$transaction(async (tx) => {
      return tx.company.findMany({
        orderBy: {
          name: 'asc',
        },
      });
    });

    expect(result).toHaveLength(0);
  });

  it('isolates business scopes by organization', async () => {
    const result = await runtime.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.organization_id',
          ${organizationA},
          true
        )
      `;

      return tx.businessScope.findMany({
        orderBy: {
          name: 'asc',
        },
      });
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(businessScopeA);
    expect(result[0]?.organizationId).toBe(organizationA);
    expect(result[0]?.companyId).toBe(companyA);
    expect(result[0]?.name).toBe('Restaurant A');
  });

  it('does not expose business scopes without tenant context', async () => {
    const result = await runtime.$transaction(async (tx) => {
      return tx.businessScope.findMany();
    });

    expect(result).toHaveLength(0);
  });

  it('allows exactly one concurrent Business Scope duplicate without an external identifier', async () => {
    const normalizedName = 'concurrent-duplicate-scope';
    await admin.businessScope.deleteMany({
      where: { organizationId: organizationA, companyId: companyA, normalizedName },
    });

    try {
      const create = () =>
        admin.businessScope.create({
          data: {
            organizationId: organizationA,
            companyId: companyA,
            type: 'RESTAURANT',
            name: 'Concurrent duplicate scope',
            normalizedName,
            externalIdentifier: null,
          },
        });
      const outcomes = await Promise.allSettled([create(), create()]);

      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
      await expect(
        admin.businessScope.count({
          where: { organizationId: organizationA, companyId: companyA, normalizedName },
        }),
      ).resolves.toBe(1);
    } finally {
      await admin.businessScope.deleteMany({
        where: { organizationId: organizationA, companyId: companyA, normalizedName },
      });
    }
  });
});
