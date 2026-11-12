import type { Locator, Page } from '@playwright/test';

export class ItemsPage {
  constructor(readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/items');
  }

  async add(name: string): Promise<void> {
    await this.page.getByLabel('New item').fill(name);
    await this.page.getByRole('button', { name: 'Add' }).click();
  }

  items(): Locator {
    return this.page.getByRole('listitem');
  }

  error(): Locator {
    return this.page.getByRole('alert');
  }
}
