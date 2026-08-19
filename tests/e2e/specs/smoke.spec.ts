import { expect, Page, test } from '@playwright/test';

const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://127.0.0.1:3001';
const demoPassword = 'Synthetic demo password 2026';

async function login(page: Page, email = 'atlas.owner@example.test') {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(demoPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(email === 'platform.admin@example.test' ? '/platform' : '/');
}

test.describe('authenticated administration journey', () => {
  test('redirects an anonymous visitor to first-party sign in', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/login\?returnTo=%2F$/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('keeps one-time Platform bootstrap reachable before authentication', async ({ page }) => {
    await page.goto('/platform/bootstrap');

    await expect(page).toHaveURL('/platform/bootstrap');
    await expect(page.getByRole('heading', { name: 'Secure platform bootstrap' })).toBeVisible();
  });

  test('logs in, renders the authoritative Organization, and logs out', async ({ page }) => {
    await login(page);

    await expect(page.getByRole('heading', { name: /Atlas Demo Group/ })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL('/login');

    await page.goto('/administration/companies');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fadministration%2Fcompanies/);
  });

  test('search never exposes another Organization records', async ({ page }) => {
    await login(page);
    await page.locator('.appSidebar a[href="/administration/companies"]').click();

    await expect(page.locator('article strong', { hasText: 'Atlas Hospitality' })).toBeVisible();
    await page.getByLabel(/Search your Organization/).fill('Northstar');
    await page.getByRole('button', { name: 'Search authorized records' }).click();
    await expect(page.getByText('Northstar Developments', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Northstar Restaurant', { exact: true })).toHaveCount(0);
  });

  test('opens an authorized Business Scope from the read-only Portfolio', async ({ page }) => {
    await login(page);
    await page.goto('/portfolio');

    await expect(page.getByRole('heading', { name: 'Companies & business scopes' })).toBeVisible();
    await page.getByRole('button', { name: /Atlas Restaurant/ }).click();
    await expect(page.getByRole('heading', { name: 'Atlas Restaurant' })).toBeVisible();
    await expect(page.getByText('Synthetic demo location', { exact: true })).toBeVisible();

    await page.getByRole('search').getByRole('textbox').fill('Northstar');
    await page.getByRole('button', { name: 'Search portfolio' }).click();
    await expect(page.getByText('No authorized records found')).toBeVisible();
    await expect(page.getByText('Northstar Developments', { exact: true })).toHaveCount(0);
  });

  test('keeps an Organization User inside explicitly granted read-only routes', async ({
    page,
  }) => {
    await login(page, 'atlas.user@example.test');

    await expect(page.getByRole('link', { name: /Portfolio/ })).toBeVisible();
    await expect(page.locator('.appSidebar a[href^="/administration/"]')).toHaveCount(0);
    await page.goto('/portfolio');
    await expect(page.getByText('Atlas Hospitality', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Atlas Restaurant/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Manage structure' })).toHaveCount(0);

    await page.goto('/administration/permissions');
    await expect(page).toHaveURL('/');
    await expect(page.locator('.appSidebar a[href^="/administration/"]')).toHaveCount(0);
  });

  test('creates a Company and completes the guided duplicate-aware Business Scope flow', async ({
    page,
  }, testInfo) => {
    const suffix = `${testInfo.project.name}-${Date.now()}`;
    const companyName = `Browser Company ${suffix}`;
    const scopeName = `Browser Scope ${suffix}`;
    await login(page);
    await page.goto('/administration/companies');

    await page.getByRole('button', { name: 'Add company' }).click();
    await page.getByRole('dialog', { name: 'Add a company' }).getByLabel('Company name').fill(companyName);
    await page.getByRole('button', { name: 'Create company' }).click();
    await expect(page.getByText('Company created.', { exact: true })).toBeVisible();
    await expect(page.locator('article', { hasText: companyName })).toBeVisible();

    await page.getByRole('button', { name: 'Add business scope' }).click();
    let scopeForm = page.getByRole('dialog', { name: 'Add a business scope' });
    await scopeForm.getByLabel('Company').selectOption({ label: companyName });
    await scopeForm.getByLabel('Scope type').selectOption('EVENT');
    await scopeForm.getByLabel('Scope name').fill(scopeName);
    await scopeForm.getByLabel('External identifier').fill(`E2E-${suffix}`);
    await scopeForm.getByLabel('Location').fill('Synthetic browser location');
    await scopeForm.getByLabel('Responsible person').fill('Synthetic Test Owner');
    const [duplicateCheck] = await Promise.all([
      page.waitForResponse((response) => response.url().includes('/duplicate-check')),
      scopeForm.getByRole('button', { name: '2. Check duplicates and review' }).click(),
    ]);
    expect(duplicateCheck.ok()).toBeTruthy();
    await expect(duplicateCheck.text()).resolves.toBe('');

    await expect(page.getByRole('heading', { name: '3. Review and confirm' })).toBeVisible();
    await expect(page.getByText(`Scope: ${scopeName} · EVENT`, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm and create scope' }).click();
    await expect(page.getByText('Business Scope created.', { exact: true })).toBeVisible();
    await expect(page.locator('article', { hasText: scopeName })).toBeVisible();

    await page.getByRole('button', { name: 'Add business scope' }).click();
    scopeForm = page.getByRole('dialog', { name: 'Add a business scope' });
    await scopeForm.getByLabel('Company').selectOption({ label: companyName });
    await scopeForm.getByLabel('Scope type').selectOption('EVENT');
    await scopeForm.getByLabel('Scope name').fill(scopeName);
    await scopeForm.getByLabel('External identifier').fill(`E2E-${suffix}`);
    await scopeForm.getByRole('button', { name: '2. Check duplicates and review' }).click();
    await expect(page.getByText(/matching Business Scope already exists/)).toBeVisible();
  });

  test('authenticated mobile administration has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await login(page);

    await expect(page.getByRole('heading', { name: /Atlas Demo Group/ })).toBeVisible();
    const fitsViewport = await page.evaluate('document.body.scrollWidth <= window.innerWidth');
    expect(fitsViewport).toBeTruthy();
  });

  test('collaborator workspace is usable without horizontal overflow', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: /Collaborators/ }).click();

    await expect(page.getByRole('heading', { name: 'Collaborators', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Invite collaborator/ }).click();
    await expect(page.getByRole('dialog', { name: 'Invite a collaborator' })).toBeVisible();
    await expect(page.getByLabel('Starting preset')).toBeVisible();
    await expect(page.getByText('Company access', { exact: true })).toBeVisible();
    await expect(page.getByText('Business scope access', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close Invite a collaborator' }).click();
    await expect(page.getByRole('heading', { name: 'Current collaborators' })).toBeVisible();
    await expect(page.getByText('atlas.owner@example.test')).toBeVisible();
    await page.getByRole('button', { name: 'Change access' }).click();
    const atlasUserOption = page.getByRole('option', { name: /atlas\.user@example\.test/ });
    const atlasUserValue = await atlasUserOption.getAttribute('value');
    if (!atlasUserValue) throw new Error('Atlas User lifecycle option is missing its value');
    await page.locator('select[name="membershipId"]').selectOption(atlasUserValue);
    await expect(page.getByRole('option', { name: 'Suspend access' })).toBeAttached();
    await expect(page.getByRole('option', { name: 'Remove access' })).toBeAttached();
    await expect(page.getByRole('option', { name: 'Change Administrator to User' })).toHaveCount(0);
    const fitsViewport = await page.evaluate('document.body.scrollWidth <= window.innerWidth');
    expect(fitsViewport).toBeTruthy();
  });

  test('permissions workflow progressively reveals focused access controls', async ({ page }) => {
    await login(page);
    await page.goto('/administration/permissions');

    await expect(page.getByRole('heading', { name: 'Collaborator access' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What can they view?' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Create template' }).click();
    await expect(page.getByRole('dialog', { name: 'Create a reusable template' })).toBeVisible();
    await expect(page.getByLabel('Template key')).toBeVisible();
    await page.getByRole('button', { name: 'Close Create a reusable template' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const collaboratorOption = page.getByRole('option', { name: /atlas\.user@example\.test/ });
    const collaboratorValue = await collaboratorOption.getAttribute('value');
    if (!collaboratorValue) throw new Error('Atlas User permission option is missing its value');
    await page.getByLabel('Collaborator').selectOption(collaboratorValue);
    await expect(page.getByRole('heading', { name: 'What can they view?' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Where does access apply?' })).toBeVisible();
    await page.getByPlaceholder('Search companies…').fill('Atlas');
    await expect(
      page
        .locator('.assignmentColumns fieldset')
        .first()
        .getByText('Atlas Hospitality', { exact: true }),
    ).toBeVisible();

    await page.getByText('All companies and business scopes', { exact: true }).click();
    await expect(page.getByText('Organization-wide access selected')).toBeVisible();
    await expect(page.getByPlaceholder('Search companies…')).toHaveCount(0);
    expect(await page.evaluate('document.body.scrollWidth <= window.innerWidth')).toBeTruthy();
  });

  test('public account journeys render without horizontal overflow', async ({ page }) => {
    const routes = [
      ['/login', 'Sign in'],
      ['/password-reset', 'Reset your password'],
      ['/password-reset/complete?token=invalid-demo-token', 'Choose a new password'],
      ['/invitations/initial-owner/accept?token=invalid-demo-token', 'Activate your Organization'],
      ['/invitations/collaborator/accept?token=invalid-demo-token', 'Join your Organization'],
      ['/platform/bootstrap', 'Secure platform bootstrap'],
    ] as const;

    for (const [route, heading] of routes) {
      await page.goto(route);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      expect(await page.evaluate('document.body.scrollWidth <= window.innerWidth')).toBeTruthy();
    }
  });

  test('remaining administration workspaces render without horizontal overflow', async ({
    page,
  }) => {
    await login(page);
    const routes = [
      ['/portfolio', 'Companies & business scopes'],
      ['/administration/companies', 'Companies & business scopes'],
      ['/administration/permissions', 'Collaborator access'],
      ['/administration/ownership', 'Ownership & promotion'],
    ] as const;

    for (const [route, heading] of routes) {
      await page.goto(route);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      expect(await page.evaluate('document.body.scrollWidth <= window.innerWidth')).toBeTruthy();
    }
    await expect(page.getByRole('option', { name: 'atlas.user@example.test' })).toBeAttached();
    await page.getByRole('tab', { name: /Review a transfer/ }).click();
    await expect(page.getByRole('button', { name: 'Accept transfer' })).toBeDisabled();
  });

  test('does not expose Platform controls to an Organization Administrator', async ({ page }) => {
    await login(page);

    for (const route of [
      '/platform',
      '/platform/directory',
      '/platform/lifecycle',
      '/platform/interventions',
    ]) {
      await page.goto(route);
      await expect(page).toHaveURL('/');
      await expect(page.getByRole('heading', { name: /Atlas Demo Group/ })).toBeVisible();
    }
  });

  test('lets the bootstrapped Platform Administrator use the minimized directory', async ({
    page,
  }) => {
    await login(page, 'platform.admin@example.test');

    await expect(page.getByRole('heading', { name: 'Provision an Organization' })).toBeVisible();
    await page.getByRole('link', { name: /Organizations/ }).click();
    await expect(page.getByRole('heading', { name: 'Organizations', exact: true })).toBeVisible();
    await expect(
      page.locator('.directoryList').getByText('Atlas Demo Group', { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('.directoryList').getByText('Northstar Demo Group', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/without opening tenant business data/i)).toBeVisible();
    expect(await page.evaluate('document.body.scrollWidth <= window.innerWidth')).toBeTruthy();
    await page.locator('.directoryItem', { hasText: 'Atlas Demo Group' }).click();
    await page.getByRole('link', { name: 'Manage lifecycle' }).click();
    await expect(page.getByRole('combobox', { name: /^Organization/ })).toHaveValue(/.+/);
    const statusSummary = page.locator('dl[aria-label="Selected Organization status"]');
    await expect(statusSummary.getByText('Current access')).toBeVisible();
    await expect(statusSummary.getByText('Current commercial status')).toBeVisible();
    await expect(statusSummary.locator('.statusBadge')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Apply status change' })).toBeEnabled();
    expect(await page.evaluate('document.body.scrollWidth <= window.innerWidth')).toBeTruthy();
    await page.getByRole('link', { name: 'Cancel' }).click();
    await page.locator('.appSidebar a[href="/platform/interventions"]').click();
    await page.getByLabel('Organization').selectOption({ label: 'Atlas Demo Group · ACTIVE' });
    await expect(
      page.getByRole('option', { name: /atlas.user@example.test · User/ }),
    ).toBeAttached();
    await expect(
      page.getByText(/No customer directory or business record enumeration/),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL('/login');
    await page.goto('/platform/directory');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fplatform%2Fdirectory/);
  });

  test('api health endpoint responds', async ({ request }) => {
    const response = await request.get(`${apiBaseUrl}/health`);

    expect(response.ok()).toBeTruthy();
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });
});
