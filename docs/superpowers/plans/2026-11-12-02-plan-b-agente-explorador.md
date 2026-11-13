# Plan B: agente explorador v0 (implementación)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un paquete `packages/explorer` que audita la app de un prospecto y produce un informe en español: un escáner determinístico (hallazgos **medidos**), skills y checklists para la exploración con el modelo (hallazgos **observados**), un paso de revisión humana y un generador de informe en HTML.

**Architecture:** El escáner es TypeScript ejecutado directo por Node 22 (sin compilar) y usa Playwright como librería. Recorre la app logueado, solo con navegaciones GET, y escribe `audits/<id>/findings/measured.json` más evidencia. La exploración son instrucciones (skill + checklists en markdown) que escriben `observed.json` con el mismo esquema. Diego revisa en `review.yaml` y un renderizador determinístico arma `informe.html`. Todo se valida contra la demo-app con bugs plantados.

**Tech Stack:** Node 22.23.4 (type stripping nativo), `@playwright/test` 1.65.0, `@axe-core/playwright` 4.14.0, `yaml` 2.9.1, TypeScript 7.0.2 (solo chequeo de tipos), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-12-agente-explorador-design.md`

## Global Constraints

- **Versiones exactas** (`--save-exact`): `@playwright/test` 1.65.0, `typescript` 7.0.2, `@types/node` 22.20.5, `@axe-core/playwright` 4.14.0, `yaml` 2.9.1.
- **TypeScript ejecutado por Node:** en `packages/explorer` todos los imports relativos llevan extensión `.ts`. Prohibido `enum`, `namespace` y parameter properties. `tsconfig`: `allowImportingTsExtensions`, `erasableSyntaxOnly`, `noEmit`, `strict`.
- **Ninguna credencial en logs, JSON, informe ni evidencia.** Contraseña y TOTP se escriben solo con `fillSecret`. Los mensajes de error nunca incluyen valores de variables de entorno.
- **Modo `read-only` (por defecto):** el escáner solo navega por GET siguiendo `<a href>`. El único POST permitido es el login. Nunca hace click en nada que no sea un link.
- **Sin `authorization` en el perfil, no hay escaneo.**
- **Hechos y opiniones separados:** `source: "measured"` solo lo escribe código determinístico. `source: "model"` nace con `review.status: "pending_review"`.
- **Datos de prospectos:** solo en ramas `audit/<id>`. En `main` solo existe `audits/example/`.
- Código e identificadores en inglés. Informe, checklists, skill y runbook en español.
- Los tests del Plan A (unit 43, demo 8, e2e 9, filtración 4) tienen que seguir pasando sin cambios en sus aserciones.
- Los commits terminan con la línea `Co-Authored-By` que indique la sesión que los hace.

## Review Focus

1. **Sesión perdida a mitad del crawl** (la app redirige al login): las páginas quedan como `blocked` con motivo "session lost". No son hallazgos ni páginas "limpias". Test en el Task 5.
2. **Login fallido o app caída:** el resultado es `status: "blocked"` con motivo, exit code distinto de 0 y sin contraseña en el mensaje. Nunca un `measured.json` vacío que parezca "sin problemas". Test en el Task 5.
3. **URLs que no se deben recorrer:** otro origen, `mailto:`, `tel:`, `javascript:`, fragmentos `#`, descargas (`.pdf`, `.zip`). Y la misma página con distinta query o barra final se cuenta una vez. Test en el Task 5 (`frontier`).
4. **Ruido de terceros y `known_noise`:** un 404 de un script de analytics no es un hallazgo del prospecto. Va marcado `thirdParty: true` y no entra en el resumen. Test en el Task 5.
5. **HTML en los datos:** un título de página o un mensaje de consola con `<script>` se muestra escapado en el informe. Test en el Task 9.

---

## Estructura de archivos

```
packages/explorer/
├─ package.json  tsconfig.json  playwright.unit.config.ts  playwright.e2e.config.ts
├─ scripts/browser-check.mjs       prueba de humo: abre Chromium y carga una URL (Task 1)
├─ src/
│  ├─ target.ts                    loadTarget(): perfil del prospecto validado
│  ├─ finding.ts                   tipos Finding / ScanResult, findingId()
│  ├─ never-click.ts               isForbidden(): links que nunca se visitan
│  ├─ frontier.ts                  normalizeUrl(), classifyLink(): qué se recorre
│  ├─ login.ts                     authenticate(): sesión con el login de la plantilla
│  ├─ scan.ts                      runScan(): crawl + chequeos → ScanResult
│  ├─ checks/page-events.ts        consola, errores JS, respuestas HTTP, imágenes
│  ├─ checks/links.ts              links rotos
│  ├─ checks/a11y.ts               axe-core
│  ├─ checks/timing.ts             TTFB y LCP
│  ├─ checks/forms.ts              estático + datos inválidos (solo staging)
│  ├─ review.ts                    writeReviewFile(), applyReview()
│  ├─ observed.ts                  validateObserved(): salida del modelo
│  ├─ report/explanations.ts       "qué es / por qué importa / fuente" por chequeo
│  ├─ report/render.ts             renderReport(): HTML en dos capas
│  ├─ retention.ts                 expiredAudits()
│  └─ cli.ts                       scan | review-file | validate-observed | report | retention
├─ checklists/*.md                 8 checklists (Task 10)
├─ skills/explorar-auditoria/SKILL.md
└─ test/*.unit.ts  test/*.e2e.ts
audits/example/target.yaml
.github/workflows/audit-scan.yml  audit-report.yml  audit-retention.yml
docs/runbook/auditoria.md
```

Archivos de una auditoría (rama `audit/<id>`): `audits/<id>/target.yaml`, `findings/measured.json`, `findings/observed.json`, `evidence/<findingId>.png`, `review.yaml`, `summary.md`, `report/informe.html`.

---

### Task 1: Paquete `explorer` y prueba de navegador en la nube

**Files:**
- Create: `packages/explorer/package.json`, `tsconfig.json`, `playwright.unit.config.ts`, `scripts/browser-check.mjs`, `test/smoke.unit.ts`
- Modify: `docs/superpowers/specs/2026-11-12-agente-explorador-design.md` (§4.3, resultado de la prueba)

**Interfaces:**
- Produces: scripts npm `test` (unit, sin navegador), `test:e2e`, `typecheck`, `explorer` (`node src/cli.ts`). `scripts/browser-check.mjs <url>` imprime `OK <status> <title>` y sale con 0, o `FAIL <motivo>` y sale con 1.

- [ ] **Step 1:** Crear `package.json` (`"name": "explorer"`, `"type": "module"`, `private`), con las dependencias de Global Constraints y los scripts: `"test": "playwright test -c playwright.unit.config.ts"`, `"test:e2e": "playwright test -c playwright.e2e.config.ts"`, `"typecheck": "tsc --noEmit -p ."`, `"explorer": "node src/cli.ts"`. `playwright.unit.config.ts` igual al de `e2e-template` (`testMatch: '**/*.unit.ts'`).
- [ ] **Step 2: Test que fija el supuesto de imports con `.ts`** en `test/smoke.unit.ts`:

```ts
import { test, expect } from '@playwright/test';
import { totp } from '../../e2e-template/template/e2e/lib/totp.ts';

test('imports with .ts extension work in the test runner', () => {
  expect(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59_000, 8)).toBe('94287082'); // RFC 6238 vector
});
```

Si el runner no resuelve imports con `.ts`, frenar y registrar un ruling: todo el paquete depende de este supuesto.

- [ ] **Step 3:** `npm install` en la raíz y `npm test -w explorer`. Expected: `1 passed`.
- [ ] **Step 4:** Escribir `scripts/browser-check.mjs`: lanza `chromium` headless, `goto(url, { timeout: 30_000 })`, imprime el resultado. Verificar en local: `node packages/demo-app/src/main.mjs` en otra terminal y `node packages/explorer/scripts/browser-check.mjs http://localhost:3000/login`. Expected: `OK 200 Sign in`.
- [ ] **Step 5: Prueba en la nube (necesita a Diego).** En una sesión de Claude Code en la nube sobre este repo, correr: `npm ci && npx playwright install --with-deps chromium`, después el check contra la demo-app levantada en la misma sesión y contra `https://example.com`. Anotar en §4.3 del diseño el resultado de cada uno (instala Chromium: sí/no; llega a localhost: sí/no; llega a internet: sí/no). **Esta prueba no bloquea las tareas siguientes:** las skills no dependen del entorno. Si no se puede hacer ahora, dejar anotado "pendiente" y seguir.
- [ ] **Step 6:** Commit `feat(explorer): package scaffold and browser check`.

---

### Task 2: Bugs plantados en la demo-app

**Files:**
- Modify: `packages/demo-app/src/server.mjs`, `packages/demo-app/src/main.mjs`
- Test: `packages/demo-app/test/planted.test.mjs`

**Interfaces:**
- Produces: `createServer({ resetToken, users, plantedBugs })`. `main.mjs` activa `plantedBugs` con `PLANTED_BUGS=1`. Con `plantedBugs: true`, la página `/items` suma el link `<a href="/lab">Lab</a>` y existen estas rutas (todas requieren sesión):

| Ruta | Comportamiento |
|---|---|
| `GET /lab` | Índice con links a todas las de abajo. El link a `/lab/delete-all` tiene el texto `Delete all` |
| `GET /lab/clean` | Página sin problemas |
| `GET /lab/broken-link` | Contiene `<a href="/lab/missing">Missing page</a>` |
| `GET /lab/missing` | 404 |
| `GET /lab/broken-image` | Contiene `<img src="/lab/missing.png" alt="Chart">` |
| `GET /lab/server-error` | 500 |
| `GET /lab/js-error` | Script inline: `console.error('planted console error'); throw new Error('planted js error')` |
| `GET /lab/unlabeled` | Formulario con `<input name="phone">` sin label y `<label for="mail">Email</label><input id="mail" name="email" type="text">` |
| `GET /lab/form`, `POST /lab/form` | Campo `type="email" required`, botón `Subscribe`. El POST acepta cualquier valor: 200 con `<p>Saved</p>` |
| `GET /lab/form-ok`, `POST /lab/form-ok` | Igual, pero un email inválido responde 400 con `<p role="alert">Invalid email</p>` |
| `GET /lab/slow` | Espera 2000 ms y responde 200 |
| `GET /lab/delete-all` | Vacía la lista de ítems y responde 200 con `Deleted` |

Sin `plantedBugs`, `/lab*` responde 404 y `/items` no tiene el link.

- [ ] **Step 1: Tests que fallan** en `test/planted.test.mjs` (mismo estilo y helpers que `server.test.mjs`):

```js
test('lab routes do not exist unless plantedBugs is on', ...)   // GET /lab → 404, /items sin "Lab"
test('lab index links to every planted page', ...)              // href de las 10 rutas GET
test('server-error responds 500 and missing responds 404', ...)
test('form accepts an invalid email, form-ok rejects it with 400 and an alert', ...)
test('delete-all empties the items list', ...)                  // después, GET /items sin "Seed item"
test('slow responds after at least 1900 ms', ...)
```

- [ ] **Step 2:** `npm test -w demo-app`. Expected: fallan los 6 nuevos, pasan los 8 existentes.
- [ ] **Step 3:** Implementar las rutas en `server.mjs` y `PLANTED_BUGS` en `main.mjs`.
- [ ] **Step 4:** `npm test -w demo-app` → 14 pasan. `cd packages/demo-app/e2e && npx playwright test` → 9 pasan (sin `PLANTED_BUGS` nada cambia).
- [ ] **Step 5:** Commit `feat(demo-app): planted bugs lab for the explorer`.

---

### Task 3: Perfil del target, esquema de hallazgos y links prohibidos

**Files:**
- Create: `packages/explorer/src/target.ts`, `src/finding.ts`, `src/never-click.ts`, `audits/example/target.yaml`
- Test: `test/target.unit.ts`, `test/finding.unit.ts`, `test/never-click.unit.ts`

**Interfaces:**
- Produces:

```ts
// target.ts
export type Mode = 'staging' | 'read-only';
export type LoginLabels = { email: string; password: string; submit: string; totp?: string };
export type Target = {
  id: string;                       // nombre de la carpeta audits/<id>
  name: string; baseUrl: string; mode: Mode;
  login: { path: string; emailEnv: string; passwordEnv: string; totpSecretEnv?: string; labels: LoginLabels } | null;
  loginPath: string | null;         // login.path, o `login_path` del YAML cuando no hay credenciales; detecta la sesión perdida
  scope: { start: string[]; include: string[]; exclude: string[]; maxPages: number; flows: string[]; maxFlows: number };
  neverClick: string[];             // fuentes de regex extra
  knownNoise: { pattern: string; reason: string }[];
  authorization: { by: string; date: string; scope: string };
  report: { brand: string };
  deliveredOn?: string;             // YYYY-MM-DD, se completa al entregar
};
export function loadTarget(file: string): Target;

// finding.ts
export type Severity = 'critical' | 'serious' | 'moderate' | 'minor';
export type ReviewStatus = 'not_required' | 'pending_review' | 'confirmed' | 'rejected' | 'needs_info';
export type Finding = {
  id: string; source: 'measured' | 'model'; check: string; title: string;
  severity: Severity; severitySource: string;
  url: string; steps: string[];
  evidence: { screenshot?: string; trace?: string; detail?: string };
  thirdParty?: boolean; checklistItem?: string;
  review: { status: ReviewStatus; note?: string };
};
export type PageRecord = { url: string; status: 'scanned' | 'blocked'; reason?: string; httpStatus?: number; title?: string };
export type SkippedLink = { url: string; text: string; reason: 'never-click' | 'out-of-scope' | 'max-pages' | 'not-a-page' };
export type ScanResult = {
  target: { id: string; name: string; baseUrl: string; mode: Mode };
  startedAt: string; finishedAt: string;
  status: 'completed' | 'blocked'; blockedReason?: string;
  pages: PageRecord[]; skippedLinks: SkippedLink[]; findings: Finding[];
};
export function findingId(check: string, url: string, key: string): string; // `${check}-${sha256(check|pathname+search|key).slice(0, 10)}`

// never-click.ts
export function isForbidden(link: { text: string; href: string }, extra?: string[]): boolean;
```

Valores por defecto de `loadTarget`: `mode: 'read-only'`, `scope.start: ['/']`, `include: []` (todo el origen), `exclude: []`, `maxPages: 50`, `maxFlows: 8`, `login.labels: { email: 'Email', password: 'Password', submit: 'Sign in' }`, `report.brand: 'QA'`. Claves del YAML en `snake_case` (`base_url`, `never_click`, `known_noise`, `max_pages`, `email_env`...).

Lista fija de `never-click` (regex sin distinción de mayúsculas, sobre el texto del link y sobre el path): `log ?out|sign ?out|cerrar sesi[oó]n|salir`, `delete|remove|destroy|eliminar|borrar|quitar`, `cancel|cancelar|unsubscribe|darse de baja|desuscribir`, `pay|purchase|buy|checkout/confirm|pagar|comprar`, `confirm|confirmar`, `send|enviar`, `reset|restablecer`.

- [ ] **Step 1: Tests que fallan.**

```ts
// target.unit.ts (cada caso escribe un YAML en un dir temporal)
test('loads a full profile and applies defaults', ...)          // mode read-only, maxPages 50, maxFlows 8
test('fails without authorization', ...)                         // /authorization is required/
test('fails when base_url contains credentials, without echoing them', ...)
test('fails on an unknown mode', ...)                            // mode: prod → /mode must be "staging" or "read-only"/
test('credential fields must be AUDIT_* env var names, never values', ...) // email_env: qa@x.com → /must be an env var name like AUDIT_/
test('takes the id from the folder name', ...)                   // audits/acme/target.yaml → id "acme"
test('the committed example profile is valid', ...)              // audits/example/target.yaml

// finding.unit.ts
test('findingId is stable and ignores origin and fragment', ...) // mismo id para http://a/x#y y https://b/x
test('findingId changes with check, path or key', ...)

// never-click.unit.ts
test('forbids destructive and outward links by text or path', ...) // "Delete all", "/logout", "Cerrar sesión", "Pagar", "/account/remove"
test('allows ordinary navigation', ...)                            // "Items", "/lab/clean", "Settings", "/reports"
test('extra patterns from the profile are applied', ...)           // extra ['archive'] prohíbe "/archive/1"
```

- [ ] **Step 2:** `npm test -w explorer`. Expected: fallan por módulos inexistentes.
- [ ] **Step 3:** Implementar. `loadTarget` parsea con `yaml`, valida y reusa `safeBaseURL` de `e2e-template/template/e2e/lib/base-url.ts`. `audits/example/target.yaml` apunta a `http://localhost:3100`, `mode: staging`, `login.email_env: AUDIT_EXAMPLE_EMAIL`, `password_env: AUDIT_EXAMPLE_PASSWORD`, `scope.start: ['/items']`, con cada campo comentado en español.
- [ ] **Step 4:** `npm test -w explorer` y `npm run typecheck -w explorer`. Expected: todo pasa.
- [ ] **Step 5:** Commit `feat(explorer): target profile, finding schema and never-click rules`.

---

### Task 4: Login compartido con la plantilla

**Files:**
- Create: `packages/e2e-template/template/e2e/lib/login-form.ts`, `packages/explorer/src/login.ts`
- Modify: `packages/e2e-template/template/e2e/pages/LoginPage.ts` (y su copia en `packages/demo-app/e2e/`, más la copia de `lib/login-form.ts`)
- Test: `packages/e2e-template/test/login-form.unit.ts`

**Interfaces:**
- Produces:

```ts
// login-form.ts — sin imports en runtime (solo `import type` de @playwright/test)
export type LoginFormOptions = {
  loginUrl: string;                 // path o URL absoluta
  email: string; password: string; totpCode?: string;
  labels: { email: string | RegExp; password: string | RegExp; submit: string | RegExp; totp?: string | RegExp };
  who: string;                      // para el mensaje de error: rol o id del target
  timeoutMs?: number;               // default 15_000
};
export function isLoginUrl(current: string, loginUrl: string): boolean;  // mismo pathname, ignora query y fragmento
export async function fillSecret(locator: Locator, value: string): Promise<void>;
export async function submitLoginForm(page: Page, options: LoginFormOptions): Promise<void>; // throws Error(`Login failed for "${who}"`)

// explorer/src/login.ts
export async function authenticate(browser: Browser, target: Target, env?: NodeJS.ProcessEnv): Promise<BrowserContext>;
// target.login === null → contexto anónimo. Variables faltantes → Error(`Missing audit credentials: set ${names}`), solo nombres.
```

`LoginPage.login(credentials, role)` pasa a delegar en `submitLoginForm` con `who: \`role "${role}"\``, de modo que el mensaje sigue siendo `Login failed for role "<role>"`.

- [ ] **Step 1: Test que falla** en `login-form.unit.ts`:

```ts
test('isLoginUrl compares pathnames and ignores query and fragment', () => {
  expect(isLoginUrl('http://x/login?next=/a', '/login')).toBe(true);
  expect(isLoginUrl('http://x/login#top', 'http://x/login')).toBe(true);
  expect(isLoginUrl('http://x/items', '/login')).toBe(false);
  expect(isLoginUrl('http://x/login-help', '/login')).toBe(false);
});
```

- [ ] **Step 2:** `npm test -w e2e-template` → falla (módulo inexistente).
- [ ] **Step 3:** Implementar `login-form.ts` moviendo `fillSecret` y la lógica de `LoginPage.login`. El éxito se espera con `page.waitForURL((url) => !isLoginUrl(url.href, loginUrl), { timeout })`; al fallar se lanza el `Error` propio, sin el mensaje original. Actualizar `LoginPage.ts`, copiar ambos archivos a la demo y verificar con `diff -r` que las copias genéricas siguen idénticas. Implementar `explorer/src/login.ts` (TOTP con `totp()` de la plantilla).
- [ ] **Step 4:** Verificar que el Plan A no cambió: `npm run test:unit` (raíz), `cd packages/demo-app/e2e && npx playwright test` → 9 pasan, `npm run test:leaks -w demo-app` → 4 pasan.
- [ ] **Step 5:** Commit `refactor(template): dependency-free login form shared with the explorer`.

---

### Task 5: Crawl de solo lectura y chequeos por eventos de página

**Files:**
- Create: `packages/explorer/src/frontier.ts`, `src/checks/page-events.ts`, `src/scan.ts`, `src/cli.ts`, `playwright.e2e.config.ts`
- Test: `test/frontier.unit.ts`, `test/scan.e2e.ts`

**Interfaces:**
- Consumes: `Target`, `Finding`, `ScanResult`, `findingId`, `isForbidden`, `authenticate`.
- Produces:

```ts
// frontier.ts
export function normalizeUrl(href: string, base: string): string | null; // absoluta, sin fragmento, sin barra final, query ordenada; null si no es http(s)
export type LinkClass = 'crawl' | 'external' | 'never-click' | 'out-of-scope' | 'not-a-page';
export function classifyLink(link: { href: string; text: string }, target: Target): LinkClass;
// 'not-a-page': mailto:, tel:, javascript:, y extensiones pdf|zip|csv|xlsx|docx|png|jpg|jpeg|gif|svg|mp4

// scan.ts
export type ScanOptions = { outDir: string; env?: NodeJS.ProcessEnv; headless?: boolean; onRequest?: (method: string, url: string) => void };
export async function runScan(target: Target, options: ScanOptions): Promise<ScanResult>;
// Escribe `${outDir}/findings/measured.json` y `${outDir}/evidence/<id>.png` (screenshot de la página del hallazgo).

// checks/page-events.ts
export function watchPage(page: Page, target: Target): { stop(): Finding[] };
```

Chequeos de esta tarea y su severidad:

| `check` | Cuándo | Severidad | `severitySource` |
|---|---|---|---|
| `http-error` | La página navegada o un recurso del mismo origen responde ≥ 500 | `critical` | `HTTP 5xx` |
| `http-error` | Un recurso (no imagen) responde 4xx | `moderate` | `HTTP 4xx` |
| `broken-image` | Una `<img>` responde ≥ 400 o falla la carga | `moderate` | `HTTP status` |
| `js-error` | Evento `pageerror` | `serious` | `uncaught exception` |
| `console-error` | `console.error` (sin contar los mensajes automáticos de recursos fallidos) | `minor` | `console.error` |

Los recursos de otro origen llevan `thirdParty: true`. Lo que coincide con `knownNoise` no genera hallazgo. CLI: `node src/cli.ts scan audits/<id>` → exit 0 si `completed`, 2 si `blocked`.

`playwright.e2e.config.ts`: `testMatch: '**/*.e2e.ts'`, `workers: 1`, `webServer: { command: 'node ../demo-app/src/main.mjs', url: 'http://localhost:3100/login', env: { PORT: '3100', PLANTED_BUGS: '1', RESET_TOKEN: 'e2e-reset' } }`. Los tests usan `AUDIT_EXAMPLE_EMAIL=admin@demo.test` y `AUDIT_EXAMPLE_PASSWORD=admin-pass` pasados por `options.env`, y resetean los datos (`POST /__test__/reset`) en `beforeEach`.

- [ ] **Step 1: Tests unitarios que fallan** (`frontier.unit.ts`):

```ts
test('normalizes fragment, trailing slash and query order', ...) // /a/?b=2&a=1#x ≡ /a?a=1&b=2
test('same-origin page links are crawled', ...)
test('other origins are external, never crawled', ...)
test('mailto, tel, javascript and downloads are not pages', ...)
test('never-click wins over scope', ...)                          // "Delete all" /lab/delete-all → 'never-click'
test('include and exclude patterns limit the scope', ...)         // include ['/lab'] deja /admin 'out-of-scope'
```

- [ ] **Step 2: Tests e2e que fallan** (`scan.e2e.ts`, target de ejemplo en modo `read-only`, `scope.start: ['/items']`):

```ts
test('finds the planted server error, broken image, js error and console error', ...)
// findings incluye: http-error critical en /lab/server-error; broken-image en /lab/broken-image;
// js-error y console-error en /lab/js-error. Cada uno con evidence.screenshot existente en disco.
test('reports nothing on the clean page', ...)                    // ningún finding con url /lab/clean
test('never visits the delete-all link and leaves data untouched', ...)
// skippedLinks contiene /lab/delete-all con reason 'never-click'; GET /items sigue mostrando "Seed item"
test('the only POST of a read-only scan is the login', ...)       // con options.onRequest: el único request que no es GET ni HEAD es `POST /login`
test('stops at max_pages and says so', ...)                       // maxPages 3 → pages.length 3, skippedLinks con reason 'max-pages'
test('a wrong password yields a blocked result without leaking it', ...)
// status 'blocked', blockedReason /Login failed/, measured.json no contiene el valor de la contraseña
test('pages that bounce to the login are blocked as "session lost"', ...)
// target sin credenciales y con login_path '/login' contra la demo (todo redirige a /login) → pages[0] 'blocked' con reason 'session lost',
// 0 findings y, como ninguna página se pudo escanear, status global 'blocked' con blockedReason /session lost/
test('third-party failures are flagged and known_noise is ignored', ...)
// con page.route se simula un script de https://cdn.example.test que responde 404 → finding con thirdParty true;
// knownNoise [{ pattern: 'planted console error' }] elimina ese console-error
```

`onRequest` recibe todos los requests del contexto del navegador y los del chequeo de links. Sirve para tests y diagnóstico.

Reglas de bloqueo: una página que termina en la URL de login queda `blocked` con `reason: 'session lost'` y no genera hallazgos. El resultado global es `blocked` si falla `authenticate`, si la primera URL no responde, o si ninguna página quedó `scanned`.

- [ ] **Step 3:** `npm test -w explorer` y `npm run test:e2e -w explorer`. Expected: fallan por módulos inexistentes.
- [ ] **Step 4:** Implementar. Crawl en anchura con una sola página: por cada URL, `watchPage`, `goto` (`waitUntil: 'load'`), detectar rebote al login con `isLoginUrl`, juntar los `<a href>` con su texto, clasificarlos y encolar. Los hallazgos se deduplican por `id`. Si `authenticate` falla o la primera URL no carga, `status: 'blocked'`.
- [ ] **Step 5:** Ambas suites pasan. `npm run typecheck -w explorer` pasa.
- [ ] **Step 6:** Commit `feat(explorer): read-only crawl with page event checks`.

---

### Task 6: Links rotos, accesibilidad, tiempos y formularios (estático)

**Files:**
- Create: `packages/explorer/src/checks/links.ts`, `checks/a11y.ts`, `checks/timing.ts`, `checks/forms.ts`
- Modify: `src/scan.ts`
- Test: `test/checks.unit.ts`, ampliar `test/scan.e2e.ts`

**Interfaces:**
- Produces:

```ts
export async function checkLinks(request: APIRequestContext, links: { url: string; text: string; foundOn: string }[]): Promise<Finding[]>;
// HEAD y, si responde 405 o 501, GET. Una sola vez por URL. `broken-link`: ≥ 500 → serious, 404/410 → moderate. Externos: thirdParty true.
export async function checkA11y(page: Page): Promise<Finding[]>;
// AxeBuilder con tags ['wcag2a','wcag2aa','wcag21a','wcag21aa']. Un finding por regla y página; severity = impact de axe; severitySource 'axe impact'.
// evidence.detail: id de la regla, helpUrl y hasta 3 selectores.
export function timingFindings(url: string, metrics: { ttfbMs: number; lcpMs: number | null }): Finding[];
// `slow-page`: TTFB > 1800 ms o LCP > 4000 ms → moderate; severitySource 'Core Web Vitals "poor" threshold (lab data)'.
export async function checkFormsStatic(page: Page): Promise<Finding[]>;
// `form-static`: campo cuyo name/id/label contiene "email" y type ≠ email → minor; input type=password sin atributo autocomplete → minor.
```

Los links `never-click` no se chequean (un HEAD también puede tener efectos). Los campos sin label los reporta axe (regla `label`), no `form-static`, para no duplicar.

- [ ] **Step 1: Tests que fallan.**

```ts
// checks.unit.ts
test('timing: poor TTFB or LCP is a finding, good values are not', ...) // (1900, null) → 1; (300, 4100) → 1; (300, 1200) → 0
// scan.e2e.ts (se agregan)
test('finds the planted broken link', ...)        // broken-link moderate, url /lab/missing, steps nombran /lab/broken-link
test('finds the unlabeled field through axe', ...) // check 'a11y', detail contiene 'label', url /lab/unlabeled
test('finds the email field typed as text', ...)   // form-static en /lab/unlabeled
test('finds the slow page', ...)                   // slow-page en /lab/slow
test('the clean page still has no findings', ...)
```

- [ ] **Step 2:** Correr ambas suites. Expected: fallan los nuevos.
- [ ] **Step 3:** Implementar e integrar en `runScan`. El LCP se mide con `PerformanceObserver` (`largest-contentful-paint`, `buffered: true`) y el TTFB con `performance.getEntriesByType('navigation')[0].responseStart`.
- [ ] **Step 4:** Ambas suites pasan. Si axe marca algo en `/lab/clean` o `/items`, corregir el HTML de la demo-app (es un bug real de la demo), no filtrar la regla.
- [ ] **Step 5:** Commit `feat(explorer): link, accessibility, timing and static form checks`.

---

### Task 7: Formularios con datos inválidos (solo staging) y test de filtración

**Files:**
- Modify: `packages/explorer/src/checks/forms.ts`, `src/scan.ts`
- Test: ampliar `test/scan.e2e.ts`, crear `test/leaks.e2e.ts`

**Interfaces:**
- Produces:

```ts
export async function checkFormsInvalid(page: Page, target: Target): Promise<Finding[]>;
// Solo si target.mode === 'staging'. Formularios elegibles: tienen un campo type=email o required, su action no es el login
// y ni el action ni el texto del botón de envío son never-click. Cada formulario (url + action) se prueba una sola vez.
// Prueba: email = 'not-an-email' (o campo required vacío), `form.noValidate = true`, `requestSubmit()`.
// Hallazgo `form-accepts-invalid` (serious, severitySource 'server accepted invalid input') cuando la respuesta es < 400
// y la página resultante no tiene [role=alert], ni :invalid, ni [aria-invalid=true].
// steps: valor enviado, status de la respuesta y que no apareció mensaje de error. Después vuelve a la URL original.
```

- [ ] **Step 1: Tests que fallan.**

```ts
// scan.e2e.ts
test('staging: reports the form that accepts an invalid email, not the one that rejects it', ...)
// form-accepts-invalid con url /lab/form; ninguno para /lab/form-ok
test('staging: never submits the login, sign-out or never-click forms', ...)   // onRequest: ningún POST a /logout
test('read-only: no form is ever submitted', ...)                               // sin form-accepts-invalid, único POST = login

// leaks.e2e.ts
test('no credential appears in measured.json, evidence text files or console output', ...)
// corre el CLI `scan` como proceso hijo con una contraseña centinela válida para un usuario de prueba creado
// vía `users` (levantar un createServer propio en puerto libre), y busca el centinela en stdout, stderr y todos
// los archivos de texto de outDir.
```

- [ ] **Step 2:** `npm run test:e2e -w explorer`. Expected: fallan los nuevos.
- [ ] **Step 3:** Implementar e integrar.
- [ ] **Step 4:** Todas las suites del explorer pasan.
- [ ] **Step 5:** Commit `feat(explorer): invalid-input form check for staging and leak test`.

---

### Task 8: Revisión humana

**Files:**
- Create: `packages/explorer/src/review.ts`
- Modify: `src/cli.ts`
- Test: `test/review.unit.ts`

**Interfaces:**
- Produces:

```ts
export function writeReviewFile(findings: Finding[], existing?: string): string;
// YAML con una entrada por hallazgo: `<id>: { status, note }` y, encima, un comentario con source, título, URL y ruta de evidencia.
// Primero los `model` (status inicial pending_review), después los `measured` (not_required). Conserva las decisiones de `existing`.
// El encabezado explica en español los valores válidos: confirmed, rejected, needs_info.
export function applyReview(findings: Finding[], reviewYaml: string): Finding[];
// Errores: id desconocido → /unknown finding id/; status inválido → /invalid status/; `rejected` sin note → /a note is required to reject/.
export function reportable(findings: Finding[]): { included: Finding[]; rejected: Finding[]; pending: Finding[] };
// included: measured no rechazados + model confirmed. pending: model en pending_review o needs_info.
```

CLI: `review-file audits/<id>` genera o actualiza `review.yaml` a partir de `measured.json` y `observed.json` (si existe).

- [ ] **Step 1: Tests que fallan:** `review file lists model findings first and keeps earlier decisions`, `applyReview sets statuses and notes`, `rejecting requires a note`, `unknown ids and invalid statuses fail with the id in the message`, `reportable splits included, rejected and pending` (un `model` sin revisar nunca queda en `included`).
- [ ] **Step 2:** `npm test -w explorer` → fallan.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test -w explorer` → pasan.
- [ ] **Step 5:** Commit `feat(explorer): human review file`.

---

### Task 9: Informe en HTML

**Files:**
- Create: `packages/explorer/src/report/explanations.ts`, `src/report/render.ts`
- Modify: `src/cli.ts`
- Test: `test/report.unit.ts`, ampliar `test/leaks.e2e.ts`

**Interfaces:**
- Produces:

```ts
// explanations.ts — una entrada por valor de `check` usado en el escáner, más 'exploration'
export type Explanation = { name: string; what: string; why: string; source: { label: string; url: string } };
export const EXPLANATIONS: Record<string, Explanation>;   // textos en español
export const SEVERITY_LABEL: Record<Severity, string>;    // critical 'Crítico', serious 'Grave', moderate 'Moderado', minor 'Menor'

// render.ts
export type ReportInput = { target: Target; scan: ScanResult; findings: Finding[]; summaryMarkdown: string; generatedOn: string };
export function renderReport(input: ReportInput): string;  // HTML autocontenido; las imágenes de evidencia van embebidas en base64
```

Contenido del informe:
- **Capa 1:** marca (`report.brand`), nombre del prospecto, fecha y modo; el resumen (`summary.md`: párrafos y listas con `-`, todo lo demás escapado); "Qué se revisó" (páginas escaneadas, flujos explorados) y "Qué no se revisó" (páginas `blocked` con motivo, links salteados agrupados por motivo, y en `read-only` la frase fija "No se enviaron formularios ni se confirmaron acciones").
- **Capa 2:** tabla de hallazgos ordenada por severidad. Cada uno con ID, etiqueta **Medido** o **Observado por el modelo, confirmado por un revisor**, severidad y su fuente, URL, pasos, evidencia y el bloque "Qué es / Por qué importa / Fuente". Los `thirdParty` van en una sección aparte, "De terceros". Al final, contadores: incluidos, descartados y pendientes.

CLI: `report audits/<id>` lee los JSON, `review.yaml` y `summary.md`, y escribe `report/informe.html`. Falla con `N findings are still pending review` si hay pendientes, salvo `--allow-pending`. Falla si no existe `summary.md`.

- [ ] **Step 1: Tests que fallan** (`report.unit.ts`):

```ts
test('every check the scanner can emit has an explanation with a source', ...)
test('layer 1 shows the summary, what was reviewed and what was not', ...)
test('measured and model findings carry different labels', ...)
test('a pending or rejected model finding is not in the report', ...)
test('third-party findings are listed apart', ...)
test('HTML in titles, console messages and the summary is escaped', ...)  // '<script>alert(1)</script>' no aparece sin escapar
test('read-only reports state that no form was submitted', ...)
// leaks.e2e.ts
test('the rendered report contains no credential', ...)
```

- [ ] **Step 2:** Correr → fallan.
- [ ] **Step 3:** Implementar. CSS embebido, legible impreso (`@media print`), sin JavaScript.
- [ ] **Step 4:** Todas las suites pasan. Generar el informe de la demo y abrirlo para una revisión visual.
- [ ] **Step 5:** Commit `feat(explorer): two-layer HTML report in Spanish`.

---

### Task 10: Checklists, skill de exploración y validador de la salida del modelo

**Files:**
- Create: `packages/explorer/checklists/{login-sesion,registro,formularios,busqueda-filtros,navegacion-contenido,flujos-varios-pasos,responsive,mensajes-error}.md`, `packages/explorer/skills/explorar-auditoria/SKILL.md`, `packages/explorer/src/observed.ts`
- Modify: `src/cli.ts`
- Test: `test/checklists.unit.ts`, `test/observed.unit.ts`

**Interfaces:**
- Produces:

```ts
export type ChecklistItem = { id: string; what: string; why: string; source: string };   // id: `<archivo>#<n>`, ej. 'login-sesion#3'
export function loadChecklists(dir: string): ChecklistItem[];
export function validateObserved(json: unknown, context: { auditDir: string; checklistIds: Set<string> }): { findings: Finding[]; errors: string[] };
```

Formato de cada ítem de checklist, que el test hace cumplir:

```markdown
### 3. El mensaje de error no revela si el email existe
- **Qué mirar:** ...
- **Por qué importa:** ...
- **Fuente:** [OWASP Authentication Cheat Sheet](https://...)
```

Reglas de `validateObserved`: cada hallazgo tiene `source: "model"`, `check: "exploration"`, `review.status: "pending_review"`, un `checklistItem` existente, al menos 2 `steps`, `evidence.screenshot` que existe dentro de `auditDir`, y un `id` igual a `findingId('exploration', url, checklistItem + title)`. Ningún hallazgo puede declararse `measured`.

Contenido obligatorio de `SKILL.md` (en español):
1. Leer `target.yaml` y respetar `mode`. En `read-only`: mirar sin confirmar, nunca apretar el último botón de algo que cree, pague, envíe o borre.
2. Usar la sesión guardada, nunca escribir la contraseña en comandos.
3. Elegir hasta `scope.maxFlows` flujos: primero `scope.flows`, después los que priorice.
4. Por flujo: plan de pasos con resultado esperado **antes** de abrir el navegador, verificar cada paso y, ante una falla, guardar evidencia y frenar ese flujo.
5. Distinguir **fallido** de **bloqueado**, y un problema del harness de un bug de la app.
6. Cada hallazgo cita un ítem de checklist. Si no encaja en ninguno, se anota en `summary.md` como observación, no como hallazgo.
7. Escribir `observed.json`, `summary.md` (borrador de la capa 1, con los flujos explorados y los bloqueados) y correr `validate-observed` hasta que no dé errores.
8. Atribución: ideas adaptadas de `snagly` (MIT, softwaretestingtrends/snagly).

- [ ] **Step 1: Tests que fallan:** `every checklist item has what, why and a source with a link`, `item ids are unique`, `the eight checklists exist and have at least 5 items each`; y para `validateObserved`: acepta un hallazgo correcto; rechaza `measured`, `checklistItem` inexistente, screenshot faltante, menos de 2 pasos y status distinto de `pending_review`.
- [ ] **Step 2:** `npm test -w explorer` → fallan.
- [ ] **Step 3:** Escribir los 8 checklists (5 a 8 ítems cada uno, con fuentes reales: WCAG 2.1, heurísticas de Nielsen Norman Group, OWASP Cheat Sheets, web.dev, documentación de Playwright), la skill y `observed.ts`. CLI: `validate-observed audits/<id>`.
- [ ] **Step 4:** `npm test -w explorer` → pasan.
- [ ] **Step 5: Prueba de punta a punta (manual, con el modelo):** con la demo-app en `PLANTED_BUGS=1`, seguir la skill sobre `audits/example`, y después `review-file`, confirmar los hallazgos en `review.yaml` y `report`. Anotar en el runbook (Task 11) lo que no haya quedado claro.
- [ ] **Step 6:** Commit `feat(explorer): checklists, exploration skill and observed-findings validator`.

---

### Task 11: Workflows, retención, runbook y CI

**Files:**
- Create: `.github/workflows/audit-scan.yml`, `audit-report.yml`, `audit-retention.yml`, `packages/explorer/src/retention.ts`, `docs/runbook/auditoria.md`
- Modify: `.github/workflows/ci.yml`, `packages/e2e-template/template/e2e/lib/ci-env.mjs` (y copia de la demo), `docs/superpowers/plans/2026-11-12-00-hoja-de-ruta.md`
- Test: `packages/explorer/test/retention.unit.ts`, ampliar `packages/e2e-template/test/ci-env.unit.ts`

**Interfaces:**
- Produces:

```ts
// ci-env.mjs: prefijo configurable, por defecto 'E2E_' (comportamiento actual intacto)
export function ciEnvEntries(secrets, prefix = 'E2E_');     // CLI: `node ci-env.mjs [prefix]`
// retention.ts
export function expiredAudits(audits: { id: string; deliveredOn?: string }[], today: string, days?: number): { id: string; deliveredOn: string; daysOverdue: number }[];
// days por defecto 30. Sin deliveredOn no vence. CLI: `retention` lee audits/*/target.yaml de cada rama audit/*.
```

Workflows:
- `audit-scan.yml`: `workflow_dispatch` con input `audit_id`. Hace checkout de la rama `audit/<audit_id>` (falla con un mensaje claro si no existe), carga los secrets `AUDIT_*` con `ci-env.mjs AUDIT_`, instala Chromium, corre `scan`, commitea `findings/` y `evidence/` en esa misma rama (`permissions: contents: write`) y sube el mismo contenido como artifact de 7 días. Si el escaneo queda `blocked`, commitea igual el resultado y el job termina en rojo.
- `audit-report.yml`: `workflow_dispatch` con `audit_id`. Corre `report` y commitea `report/informe.html` en la rama. También lo sube como artifact.
- `audit-retention.yml`: `schedule` semanal y `workflow_dispatch`. Lista las auditorías vencidas en el resumen del job (`$GITHUB_STEP_SUMMARY`) y termina en rojo si hay alguna. **No borra nada.**
- `ci.yml`: job nuevo `explorer` con `npm ci`, `playwright install --with-deps chromium`, `npm run typecheck -w explorer`, `npm test -w explorer`, `npm run test:e2e -w explorer`.
- **`main` solo lleva el ejemplo:** `retention.unit.ts` suma el test `main only ships audits/example`, que falla si `audits/` contiene otra carpeta. `ci.yml` corre en `main` y en PRs, nunca en las ramas `audit/*`, así que no molesta a una auditoría en curso.
- **Solo repo privado:** `audit-scan.yml` y `audit-report.yml` empiezan con un paso que consulta `gh api repos/$GITHUB_REPOSITORY --jq .private` y frena si no es `true`.

`docs/runbook/auditoria.md` (español), con: 1) texto de autorización para enviar al prospecto (alcance, fechas, staging o producción, usuario de prueba dedicado, dónde se guardan los datos, borrado a los 30 días, baja del usuario al terminar); 2) crear la rama `audit/<id>` y el `target.yaml`; 3) cargar los secrets `AUDIT_<ID>_*`; 4) disparar el escaneo; 5) lanzar la exploración (nube o local, según el resultado del Task 1); 6) revisar `review.yaml` y editar `summary.md`; 7) generar y entregar el informe, completar `delivered_on`; 8) borrar la rama a los 30 días; 9) qué hacer si el escaneo queda `blocked`.

- [ ] **Step 1: Tests que fallan:** `expiredAudits` (31 días → vencida con `daysOverdue: 1`; 30 días → no; sin `deliveredOn` → no) y `ciEnvEntries(secrets, 'AUDIT_')` (solo `AUDIT_*`; el prefijo por defecto sigue devolviendo solo `E2E_*`).
- [ ] **Step 2:** Correr → fallan.
- [ ] **Step 3:** Implementar, escribir los workflows y el runbook, y actualizar la hoja de ruta (Plan B hecho, notas para el Plan C: el esquema `Finding`).
- [ ] **Step 4:** `npx @action-validator/cli` sobre los cuatro workflows → OK. Todas las suites del repo pasan: `npm run test:unit`, demo e2e (9), filtración (4), explorer unit y e2e.
- [ ] **Step 5:** Commit `feat(explorer): audit workflows, retention reminder and runbook`.

---

## Cobertura del diseño

| Sección del diseño | Tasks |
|---|---|
| §2 Principios (medido/observado, evidencia, checklists, enseñar) | 3, 5, 9, 10 |
| §4.1 Perfil del target | 3 |
| §4.2 Escáner | 4, 5, 6, 7 |
| §4.3 Exploración y riesgo de la nube | 1, 10 |
| §4.4 Revisión | 8 |
| §4.5 Informe | 9 |
| §5 Bugs plantados | 2, 5, 6, 7 |
| §6 Restricciones (credenciales, retención, autorización) | 3, 7, 9, 11 |
| §7 Rama por auditoría, login configurable, límites | 3, 4, 11 |
