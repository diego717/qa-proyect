import { test, expect } from '../fixtures';

test('home loads for an authenticated user', async ({ page }) => {
  await page.goto('/');
  await expect(page).not.toHaveURL(/login/);
});
