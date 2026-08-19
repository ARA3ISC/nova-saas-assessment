import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { expect, Page, test } from '@playwright/test';

import { hashPassword } from '../../../apps/api/src/identity/domain/password';

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/nova?schema=public';
const password = 'Synthetic governance password 2026';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

test('promotes a User and completes ownership transfer while retaining the former owner', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const organizationId = randomUUID();
  const ownerIdentityId = randomUUID();
  const successorIdentityId = randomUUID();
  const ownerMembershipId = randomUUID();
  const successorMembershipId = randomUUID();
  const ownerEmail = `browser-owner-${randomUUID()}@example.test`;
  const successorEmail = `browser-successor-${randomUUID()}@example.test`;
  const passwordHash = await hashPassword(password);

  await prisma.$connect();
  await prisma.identity.createMany({
    data: [
      { id: ownerIdentityId, email: ownerEmail, normalizedEmail: ownerEmail },
      { id: successorIdentityId, email: successorEmail, normalizedEmail: successorEmail },
    ],
  });
  await prisma.passwordCredential.createMany({
    data: [
      { identityId: ownerIdentityId, passwordHash },
      { identityId: successorIdentityId, passwordHash },
    ],
  });
  await prisma.organization.create({
    data: {
      id: organizationId,
      name: `Browser Governance ${organizationId}`,
      accessStatus: 'PROVISIONING',
    },
  });
  await prisma.$transaction(async (tx) => {
    await tx.membership.createMany({
      data: [
        {
          id: ownerMembershipId,
          organizationId,
          identityId: ownerIdentityId,
          profile: 'Administrator',
        },
        {
          id: successorMembershipId,
          organizationId,
          identityId: successorIdentityId,
          profile: 'User',
        },
      ],
    });
    await tx.organizationOwnership.create({
      data: { organizationId, membershipId: ownerMembershipId },
    });
    await tx.organization.update({
      where: { id: organizationId },
      data: { accessStatus: 'ACTIVE' },
    });
  });

  try {
    await login(page, ownerEmail);
    await page.goto('/administration/ownership');
    const promoteForm = page
      .getByRole('heading', { name: 'Promote a user' })
      .locator('xpath=ancestor::form');
    await promoteForm.getByLabel('Active User').selectOption({ label: successorEmail });
    await promoteForm.getByLabel('Reason').fill('Browser promotion journey');
    await promoteForm.getByRole('checkbox').check();
    await promoteForm
      .getByRole('button', { name: 'Promote to administrator' })
      .click({ noWaitAfter: true });
    await expect(page.getByRole('status')).toContainText('User promoted to Administrator');
    await page.getByRole('tab').nth(1).click();
    await expect(page.getByRole('heading', { name: 'Propose an ownership transfer' })).toBeVisible();
    const proposalForm = page
      .getByRole('heading', { name: 'Propose an ownership transfer' })
      .locator('xpath=ancestor::form');
    await proposalForm
      .getByLabel('Successor Administrator')
      .selectOption({ label: successorEmail });
    await proposalForm.getByLabel('Reason').fill('Browser ownership journey');
    await proposalForm.getByRole('checkbox').check();
    await proposalForm.getByRole('button', { name: 'Propose transfer' }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await login(page, successorEmail);
    await page.goto('/administration/ownership');
    await page.getByRole('tab', { name: /Review a transfer/ }).click();
    const acceptanceForm = page
      .getByRole('heading', { name: 'Review an ownership transfer' })
      .locator('xpath=ancestor::form');
    await acceptanceForm.getByLabel('Pending proposal').selectOption({ index: 1 });
    await acceptanceForm.getByLabel('Reason').fill('Accept browser ownership journey');
    await acceptanceForm.getByRole('checkbox').check();
    await acceptanceForm.getByRole('button', { name: 'Accept transfer' }).click();
    await expect(page).toHaveURL(/\/login\?reason=ownership-transferred/);

    await login(page, successorEmail);
    await page.goto('/administration/collaborators');
    await expect(
      page
        .locator('.collaboratorRow', { hasText: successorEmail })
        .getByText('Administrator · Organization owner', { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .locator('.collaboratorRow', { hasText: ownerEmail })
        .getByText('Administrator', { exact: true }),
    ).toBeVisible();
  } finally {
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.identity.deleteMany({
      where: { id: { in: [ownerIdentityId, successorIdentityId] } },
    });
    await prisma.$disconnect();
  }
});
