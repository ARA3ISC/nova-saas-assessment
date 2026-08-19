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



  test('logs in, renders the authoritative Organization, and logs out', async ({ page }) => {
    await login(page);

    await expect(page.getByRole('heading', { name: /Atlas Demo Group/ })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL('/login');

    await page.goto('/administration/companies');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fadministration%2Fcompanies/);
  });







  test('authenticated mobile administration has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await login(page);

    await expect(page.getByRole('heading', { name: /Atlas Demo Group/ })).toBeVisible();
    const fitsViewport = await page.evaluate('document.body.scrollWidth <= window.innerWidth');
    expect(fitsViewport).toBeTruthy();
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



  test('api health endpoint responds', async ({ request }) => {
    const response = await request.get(`${apiBaseUrl}/health`);

    expect(response.ok()).toBeTruthy();
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });
});
