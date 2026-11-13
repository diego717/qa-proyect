import { test, expect } from '../fixtures';

test.describe('as admin', () => {
  test.use({ role: 'admin' });

  test('sees the admin page', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
  });
});

test('user is forbidden from admin', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByText('Forbidden')).toBeVisible();
});
