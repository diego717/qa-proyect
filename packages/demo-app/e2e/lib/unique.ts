import { randomBytes } from 'node:crypto';

/** Unique, readable name for test data, so parallel tests never collide. */
export function uniqueName(prefix: string): string {
  const random = Array.from(randomBytes(4), (b) => (b % 36).toString(36)).join('');
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}
