import { expect, test } from '@playwright/test';

const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://127.0.0.1:3001';

test.describe('scaffold smoke', () => {
  test('web home page loads', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'NOVA' })).toBeVisible();
    await expect(page.getByText('Web application scaffold is running.')).toBeVisible();
  });

  test('api health endpoint responds', async ({ request }) => {
    const response = await request.get(`${apiBaseUrl}/health`);

    expect(response.ok()).toBeTruthy();
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });
});
