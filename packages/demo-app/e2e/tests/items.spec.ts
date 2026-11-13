import { test, expect } from '../fixtures';
import { ItemsPage } from '../pages/ItemsPage';
import { uniqueName } from '../lib/unique';

test('adds an item and shows it in the list', async ({ page }) => {
  const items = new ItemsPage(page);
  const name = uniqueName('item');
  await items.goto();
  await items.add(name);
  await expect(items.items()).toContainText([name]);
});

test('rejects an empty item name', async ({ page }) => {
  const items = new ItemsPage(page);
  await items.goto();
  await items.add('   ');
  await expect(items.error()).toHaveText('Name is required');
});

test('reset restored the seed item', async ({ page }) => {
  const items = new ItemsPage(page);
  await items.goto();
  await expect(items.items()).toContainText(['Seed item']);
});
