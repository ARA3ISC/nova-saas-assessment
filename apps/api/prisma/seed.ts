import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();
const password = 'Synthetic demo password 2026';

async function seedOrganization(params: {
  name: string;
  email: string;
  company: string;
  scope: string;
  userEmail?: string;
}) {
  const organization =
    (await prisma.organization.findFirst({ where: { name: params.name } })) ??
    (await prisma.organization.create({
      data: { name: params.name, accessStatus: 'PROVISIONING', commercialStatus: 'DEMO' },
    }));
  const identity = await prisma.identity.upsert({
    where: { normalizedEmail: params.email },
    update: {},
    create: {
      email: params.email,
      normalizedEmail: params.email,
      passwordCredential: {
        create: {
          passwordHash: await argon2.hash(password, {
            type: argon2.argon2id,
            memoryCost: 19_456,
            timeCost: 2,
            parallelism: 1,
          }),
        },
      },
    },
  });
  const membership = await prisma.membership.upsert({
    where: { identityId: identity.id },
    update: {},
    create: {
      organizationId: organization.id,
      identityId: identity.id,
      profile: 'Administrator',
      status: 'ACTIVE',
    },
  });
  await prisma.organizationOwnership.upsert({
    where: { organizationId: organization.id },
    update: {},
    create: { organizationId: organization.id, membershipId: membership.id },
  });
  if (organization.accessStatus === 'PROVISIONING') {
    await prisma.organization.update({
      where: { id: organization.id },
      data: { accessStatus: 'ACTIVE' },
    });
  }
  const company = await prisma.company.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: params.company } },
    update: {},
    create: { organizationId: organization.id, name: params.company },
  });
  const scope = await prisma.businessScope.upsert({
    where: {
      organizationId_companyId_type_normalizedName_normalizedExternalIdentifier: {
        organizationId: organization.id,
        companyId: company.id,
        type: 'RESTAURANT',
        normalizedName: params.scope.toLowerCase(),
        normalizedExternalIdentifier: 'demo-001',
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      companyId: company.id,
      type: 'RESTAURANT',
      name: params.scope,
      normalizedName: params.scope.toLowerCase(),
      externalIdentifier: 'DEMO-001',
      normalizedExternalIdentifier: 'demo-001',
      location: 'Synthetic demo location',
    },
  });
  await prisma.permissionPresetVersion.upsert({
    where: {
      organizationId_key_version: { organizationId: organization.id, key: 'READ_ONLY', version: 1 },
    },
    update: {
      label: 'Read-only',
      capabilities: ['companies.read', 'business_scopes.read'],
      active: true,
    },
    create: {
      organizationId: organization.id,
      key: 'READ_ONLY',
      label: 'Read-only',
      version: 1,
      capabilities: ['companies.read', 'business_scopes.read'],
    },
  });
  if (params.userEmail) {
    const userIdentity = await prisma.identity.upsert({
      where: { normalizedEmail: params.userEmail },
      update: {},
      create: {
        email: params.userEmail,
        normalizedEmail: params.userEmail,
        passwordCredential: {
          create: {
            passwordHash: await argon2.hash(password, {
              type: argon2.argon2id,
              memoryCost: 19_456,
              timeCost: 2,
              parallelism: 1,
            }),
          },
        },
      },
    });
    const userMembership = await prisma.membership.upsert({
      where: { identityId: userIdentity.id },
      update: { profile: 'User', status: 'ACTIVE', suspendedAt: null, removedAt: null },
      create: {
        organizationId: organization.id,
        identityId: userIdentity.id,
        profile: 'User',
        status: 'ACTIVE',
      },
    });
    for (const capability of ['companies.read', 'business_scopes.read']) {
      await prisma.capabilityGrant.upsert({
        where: {
          organizationId_membershipId_capability: {
            organizationId: organization.id,
            membershipId: userMembership.id,
            capability,
          },
        },
        update: {},
        create: { organizationId: organization.id, membershipId: userMembership.id, capability },
      });
    }
    await prisma.companyGrant.upsert({
      where: {
        organizationId_membershipId_companyId: {
          organizationId: organization.id,
          membershipId: userMembership.id,
          companyId: company.id,
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        membershipId: userMembership.id,
        companyId: company.id,
      },
    });
    await prisma.businessScopeGrant.upsert({
      where: {
        organizationId_membershipId_businessScopeId: {
          organizationId: organization.id,
          membershipId: userMembership.id,
          businessScopeId: scope.id,
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        membershipId: userMembership.id,
        businessScopeId: scope.id,
      },
    });
  }
}

async function main() {
  await prisma.capabilityDefinition.upsert({
    where: { key: 'companies.read' },
    update: { label: 'View companies', active: true },
    create: { key: 'companies.read', label: 'View companies', scopeType: 'COMPANY', active: true },
  });
  await prisma.capabilityDefinition.upsert({
    where: { key: 'business_scopes.read' },
    update: { label: 'View business scopes', active: true },
    create: {
      key: 'business_scopes.read',
      label: 'View business scopes',
      scopeType: 'BUSINESS_SCOPE',
      active: true,
    },
  });
  await seedOrganization({
    name: 'Atlas Demo Group',
    email: 'atlas.owner@example.test',
    company: 'Atlas Hospitality',
    scope: 'Atlas Restaurant',
    userEmail: 'atlas.user@example.test',
  });
  await seedOrganization({
    name: 'Northstar Demo Group',
    email: 'northstar.owner@example.test',
    company: 'Northstar Developments',
    scope: 'Northstar Restaurant',
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
