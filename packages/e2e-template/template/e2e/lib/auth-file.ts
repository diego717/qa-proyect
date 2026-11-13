import path from 'node:path';

/** Where the logged-in browser state (storageState) of a role is saved. */
export function authFile(role: string): string {
  return path.join(__dirname, '..', '.auth', `${role}.json`);
}
