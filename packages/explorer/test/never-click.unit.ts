import { test, expect } from '@playwright/test';
import { isForbidden } from '../src/never-click.ts';

test('forbids destructive and outward links by text or path', () => {
  const forbidden = [
    { text: 'Delete all', href: '/lab/delete-all' },
    { text: 'Account', href: '/logout' },
    { text: 'Cerrar sesión', href: '/session' },
    { text: 'Pagar', href: '/cart' },
    { text: 'Settings', href: '/account/remove' },
    { text: 'Darse de baja', href: '/newsletter' },
    { text: 'Confirmar pedido', href: '/orders/12' },
    { text: 'Sign Out', href: '/s' },
  ];
  for (const link of forbidden) expect(isForbidden(link), JSON.stringify(link)).toBe(true);
});

test('allows ordinary navigation', () => {
  const allowed = [
    { text: 'Items', href: '/items' },
    { text: 'Clean page', href: '/lab/clean' },
    { text: 'Settings', href: '/settings' },
    { text: 'Reports', href: '/reports' },
    { text: 'Broken link', href: '/lab/broken-link' },
  ];
  for (const link of allowed) expect(isForbidden(link), JSON.stringify(link)).toBe(false);
});

test('extra patterns from the profile are applied', () => {
  expect(isForbidden({ text: 'Item 1', href: '/archive/1' })).toBe(false);
  expect(isForbidden({ text: 'Item 1', href: '/archive/1' }, ['archive'])).toBe(true);
});
