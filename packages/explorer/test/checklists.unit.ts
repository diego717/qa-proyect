import { test, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChecklists } from '../src/observed.ts';

const checklistsDir = fileURLToPath(new URL('../checklists/', import.meta.url));
const EXPECTED = [
  'login-sesion',
  'registro',
  'formularios',
  'busqueda-filtros',
  'navegacion-contenido',
  'flujos-varios-pasos',
  'responsive',
  'mensajes-error',
];

test('the eight checklists exist and have at least 5 items each', () => {
  const items = loadChecklists(checklistsDir);
  for (const name of EXPECTED) {
    expect(items.filter((i) => i.id.startsWith(`${name}#`)).length, name).toBeGreaterThanOrEqual(5);
  }
});

test('every checklist item has what, why and a source with a link', () => {
  for (const item of loadChecklists(checklistsDir)) {
    expect(item.title.length, item.id).toBeGreaterThan(5);
    expect(item.what.length, item.id).toBeGreaterThan(20);
    expect(item.why.length, item.id).toBeGreaterThan(20);
    expect(item.source, item.id).toMatch(/^\[[^\]]+\]\(https:\/\/[^)\s]+\)$/);
  }
});

test('item ids are unique', () => {
  const ids = loadChecklists(checklistsDir).map((i) => i.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test('an item missing a field is an error that names the file and the item', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'qa-checklists-'));
  writeFileSync(path.join(dir, 'roto.md'), '# Roto\n\n### 1. Algo\n- **Qué mirar:** una cosa larga para mirar\n- **Fuente:** [x](https://x.test)\n');
  expect(() => loadChecklists(dir)).toThrow(/roto#1.*Por qué importa/);
});
