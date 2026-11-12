# Plan A: plantilla e2e + runbook de onboarding (implementación)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un kit que, con un comando, instala en el repo de un cliente una carpeta `/e2e` de Playwright estándar (login por rol con `storageState`, seed/reset de datos, page objects, cuarentena de flaky) y un workflow de GitHub Actions para PR y nightly. Queda validado de punta a punta contra una app propia, el "cliente cero".

**Architecture:** Monorepo npm con dos paquetes. `packages/e2e-template` contiene la plantilla (`template/`) y un CLI `bin/init.mjs` que la copia. `packages/demo-app` es una app Node sin dependencias (login, roles, ítems, endpoint de reset) que se onboardea con el mismo CLI que se va a usar con los clientes reales. La plantilla no depende de ningún paquete propio, así que el cliente se queda con Playwright puro.

**Tech Stack:** Node 22 (instalado: v22.23.4), `@playwright/test` (versión exacta fija), TypeScript, GitHub Actions, `node:test` para la demo-app.

**Spec:** `docs/superpowers/specs/2026-11-12-motor-qa-spec.md` · Hoja de ruta y contratos: `docs/superpowers/plans/2026-11-12-00-hoja-de-ruta.md`

## Global Constraints

- **"Los tests son tuyos":** las únicas dependencias de `template/e2e/package.json` son `@playwright/test` (versión exacta, `--save-exact`), `typescript` y `@types/node`. Ningún import a paquetes propios.
- Todo lo que llega al cliente vive en `e2e/` y `.github/workflows/e2e.yml`. Nada más se toca en su repo.
- Los secretos solo se leen del entorno (o de `e2e/.env`, que está en el `.gitignore`). Nunca se escriben en archivos versionados.
- Rutas fijas (contrato con el Plan C): `e2e/results/results.json`, `e2e/test-results/`, `e2e/playwright-report/` y `e2e/.auth/<rol>.json`.
- Nunca se bloquea un PR por un flaky conocido: `retries: 2` en CI y los tests en cuarentena se saltean en el job bloqueante.
- El paso de ingesta usa `continue-on-error: true` y solo corre si existe el secreto `QA_INGEST_URL`.
- Los identificadores y la documentación para clientes (README de la plantilla, la página de manejo de datos) van en inglés. El runbook interno va en español.
- Las rutas con espacios y tildes tienen que funcionar (la máquina de desarrollo es `C:\Users\Diego Sasén\...`).

## Review Focus

1. **Secretos faltantes o vacíos en CI:** el error tiene que nombrar las variables exactas que faltan, no terminar en un timeout de login. Lo cubre el Task 2 (`credentialsFor`).
2. **Rutas de Windows, espacios y tildes:** la clave de cuarentena se normaliza a `/` y el `init` funciona sobre `cliente demo ñ/`. Lo cubren los Tasks 2 y 4.
3. **Endpoint de reset expuesto:** sin token configurado responde 404 y con token incorrecto responde 403. Lo cubre el Task 1.
4. **Contraseña incorrecta o UI de login cambiada:** el setup de auth falla con `Login failed for role "<rol>"` y los tests dependientes no corren. Lo cubre el Task 5, paso de verificación negativa.
5. **Backend de ingesta caído o sin configurar:** el CI del cliente sigue en verde. Lo cubre el Task 6, paso de verificación con una URL inválida.

---

## Estructura de archivos

```
qa_proyect/
├─ package.json                         workspaces ["packages/*"], scripts test:unit
├─ .gitignore
├─ .github/workflows/ci.yml             CI del monorepo (Task 6)
├─ packages/
│  ├─ demo-app/
│  │  ├─ package.json                   "type": "module", sin dependencias
│  │  ├─ src/server.mjs                 createServer(options)
│  │  ├─ src/main.mjs                   arranca en PORT (3000)
│  │  ├─ test/server.test.mjs           node:test
│  │  └─ e2e/                           generado por init en el Task 5 + specs propios
│  └─ e2e-template/
│     ├─ package.json                   devDeps: @playwright/test, typescript
│     ├─ playwright.unit.config.ts      corre test/*.unit.ts sin navegador
│     ├─ bin/init.mjs                   CLI + initTemplate()
│     ├─ test/*.unit.ts
│     └─ template/
│        ├─ .github/workflows/e2e.yml
│        └─ e2e/
│           ├─ package.json  tsconfig.json  .gitignore  .env.example  README.md
│           ├─ qa.config.ts            ÚNICO archivo que se edita por cliente
│           ├─ playwright.config.ts
│           ├─ quarantine.json         []
│           ├─ lib/credentials.ts  lib/totp.ts  lib/quarantine.ts  lib/unique.ts  lib/auth-file.ts
│           ├─ fixtures/index.ts
│           ├─ pages/LoginPage.ts
│           ├─ setup/seed.setup.ts  setup/auth.setup.ts
│           └─ tests/smoke.spec.ts
└─ docs/runbook/onboarding.md  docs/runbook/data-handling.md   (Task 7)
```

---

### Task 1: Monorepo y demo-app ("cliente cero")

**Files:**
- Create: `package.json`, `.gitignore`, `packages/demo-app/package.json`, `packages/demo-app/src/server.mjs`, `packages/demo-app/src/main.mjs`
- Test: `packages/demo-app/test/server.test.mjs`

**Interfaces:**
- Produces: `createServer({ resetToken?: string, users?: User[] }): http.Server` donde `User = { email, password, role: 'user' | 'admin' }`. Por defecto: `user@demo.test` / `user-pass` (rol user) y `admin@demo.test` / `admin-pass` (rol admin). Los ítems semilla son `["Seed item"]`.
- Rutas y textos exactos (los usan los specs del Task 5):
  - `GET /login`: formulario con labels `Email` y `Password` y botón `Sign in`. `POST /login` (form-urlencoded): si las credenciales son válidas, setea la cookie `session` HttpOnly y redirige con 303 a `/items`; si no, responde 401 con el texto `Invalid email or password`.
  - `GET /`: redirige con 303 a `/items`. Sin sesión, toda ruta protegida redirige con 303 a `/login`.
  - `GET /items`: heading `Items`, lista `<ul>` de ítems, input con label `New item` y botón `Add`. `POST /items`: un nombre vacío o solo con espacios devuelve 400 con `Name is required`; si no, agrega el ítem y redirige con 303 a `/items`.
  - `GET /admin`: heading `Admin` para el rol admin. Para el rol user responde 403 con `Forbidden`.
  - `POST /__test__/reset`: si no hay `resetToken` configurado responde **404**. Si el header `x-test-reset-token` es incorrecto responde **403**. Si es correcto, restaura los ítems semilla, conserva las sesiones y responde **204**.
- `main.mjs` lee `PORT` (por defecto 3000) y `RESET_TOKEN`.

- [ ] **Step 1: Inicializar el repo.** `git init`. Crear la raíz: `package.json` con `{"private": true, "workspaces": ["packages/*"], "scripts": {"test:unit": "npm test --workspaces --if-present"}}` y un `.gitignore` con `node_modules/ .auth/ results/ test-results/ playwright-report/ .env`.

- [ ] **Step 2: Escribir los tests que fallan** en `test/server.test.mjs`. Levantar el servidor con `listen(0)` y usar `fetch` con `redirect: 'manual'`:

```js
test('reset is disabled (404) when no resetToken is configured', ...)      // POST /__test__/reset → 404
test('reset rejects a wrong token with 403', ...)                          // header 'x-test-reset-token: nope' → 403
test('reset with the right token restores seed items and returns 204', ...) // agregar ítem, reset, GET /items no lo contiene y contiene "Seed item"
test('invalid login returns 401 with message', ...)                         // body incluye "Invalid email or password"
test('user role gets 403 on /admin', ...)
test('empty item name returns 400 "Name is required"', ...)                 // name="   "
test('unauthenticated /items redirects to /login', ...)                     // 303, location /login
```

- [ ] **Step 3: Verificar que fallan.** Ejecutar `npm test -w demo-app` (script: `node --test test/`). Resultado esperado: FAIL, porque `createServer` no existe.

- [ ] **Step 4: Implementar `createServer` y `main.mjs`.** Usar solo `node:http` y `node:crypto` (`randomUUID` para las sesiones), con estado en memoria y HTML mínimo con `<label for>` correctos para que funcionen los locators por rol y por label.

- [ ] **Step 5: Verificar que pasan.** Ejecutar `npm test -w demo-app`. Resultado esperado: 7 pass, 0 fail.

- [ ] **Step 6: Commit** con el mensaje `feat(demo-app): minimal client-zero app with roles and test reset endpoint`.

---

### Task 2: Helpers de la plantilla (credenciales, TOTP, cuarentena, nombres únicos)

**Files:**
- Create: `packages/e2e-template/package.json`, `packages/e2e-template/playwright.unit.config.ts`, `template/e2e/lib/credentials.ts`, `template/e2e/lib/totp.ts`, `template/e2e/lib/quarantine.ts`, `template/e2e/lib/unique.ts`
- Test: `packages/e2e-template/test/credentials.unit.ts`, `totp.unit.ts`, `quarantine.unit.ts`, `unique.unit.ts`

**Interfaces:**
- Produces:
  - `type Credentials = { email: string; password: string; totpSecret?: string }`
  - `credentialsFor(role: string, env: NodeJS.ProcessEnv = process.env): Credentials`. Lee `E2E_<ROL>_EMAIL`, `E2E_<ROL>_PASSWORD` y `E2E_<ROL>_TOTP_SECRET` (opcional). `<ROL>` se pasa a mayúsculas y todo carácter no alfanumérico se convierte en `_` (`power-user` → `POWER_USER`). Un string vacío cuenta como faltante.
  - `totp(secretBase32: string, nowMs: number = Date.now(), digits = 6): string`. Implementa RFC 6238 con HMAC-SHA1 y paso de 30 s usando `node:crypto`. Acepta minúsculas y espacios en el secreto; un carácter inválido lanza un error.
  - `quarantineKey(titlePath: string[]): string`. Hace `titlePath.join(' > ')` con `\` normalizado a `/`.
  - `loadQuarantine(file: string): string[]`. Si el archivo no existe devuelve `[]`. Si el JSON es inválido o no es un array de strings, lanza un `Error` cuyo mensaje incluye la ruta del archivo.
  - `quarantineAction(key: string, list: string[], mode: 'exclude' | 'only'): 'run' | 'skip'`
  - `uniqueName(prefix: string): string`, con el formato `${prefix}-${base36 timestamp}-${4 chars aleatorios}`.
- `playwright.unit.config.ts`: `testDir: 'test'`, `testMatch: '**/*.unit.ts'`, sin `use.browserName` (son tests sin `page`). Script `"test": "playwright test -c playwright.unit.config.ts"`.

- [ ] **Step 1: Escribir los tests que fallan:**

```ts
// credentials.unit.ts
expect(credentialsFor('admin', { E2E_ADMIN_EMAIL: 'a@x', E2E_ADMIN_PASSWORD: 'p' }))
  .toEqual({ email: 'a@x', password: 'p', totpSecret: undefined });
expect(credentialsFor('power-user', { E2E_POWER_USER_EMAIL: 'e', E2E_POWER_USER_PASSWORD: 'p' }).email).toBe('e');
expect(() => credentialsFor('admin', { E2E_ADMIN_EMAIL: 'a@x', E2E_ADMIN_PASSWORD: '' }))
  .toThrow('Missing E2E credentials for role "admin": set E2E_ADMIN_PASSWORD');
expect(() => credentialsFor('admin', {}))
  .toThrow('Missing E2E credentials for role "admin": set E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD');

// totp.unit.ts — vectores RFC 6238 (secreto ASCII "12345678901234567890")
const S = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
expect(totp(S, 59_000, 8)).toBe('94287082');
expect(totp(S, 1_111_111_109_000, 8)).toBe('07081804');
expect(totp(S, 59_000)).toBe('287082');
expect(totp('gezd gnbv gy3t qojq gezd gnbv gy3t qojq', 59_000)).toBe('287082');
expect(() => totp('GEZ1!', 0)).toThrow(/base32/i);

// quarantine.unit.ts
expect(quarantineKey(['tests\\items.spec.ts', 'Items', 'adds an item'])).toBe('tests/items.spec.ts > Items > adds an item');
expect(quarantineAction('k', ['k'], 'exclude')).toBe('skip');
expect(quarantineAction('k', [], 'exclude')).toBe('run');
expect(quarantineAction('k', ['k'], 'only')).toBe('run');
expect(quarantineAction('other', ['k'], 'only')).toBe('skip');
expect(loadQuarantine(join(tmp, 'missing.json'))).toEqual([]);
// archivo con '{"a":1}' → toThrow(con la ruta del archivo); con '[1]' → toThrow

// unique.unit.ts
expect(uniqueName('item')).toMatch(/^item-[0-9a-z]+-[0-9a-z]{4}$/);
expect(uniqueName('item')).not.toBe(uniqueName('item'));
```

- [ ] **Step 2: Instalar y verificar que fallan.** En `packages/e2e-template` ejecutar `npm i -D --save-exact @playwright/test@latest typescript @types/node` y luego `npm test -w e2e-template`. Resultado esperado: FAIL por imports no resueltos.

- [ ] **Step 3: Implementar los cuatro módulos** con las firmas de arriba. Sin dependencias externas.

- [ ] **Step 4: Verificar que pasan.** Ejecutar `npm test -w e2e-template`. Resultado esperado: todos pass.

- [ ] **Step 5: Commit** con el mensaje `feat(e2e-template): credentials, TOTP, quarantine and unique-name helpers`.

---

### Task 3: Config, fixtures, setup de seed/auth y page object de login

**Files:**
- Create en `packages/e2e-template/template/e2e/`: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `README.md`, `qa.config.ts`, `playwright.config.ts`, `quarantine.json`, `lib/auth-file.ts`, `fixtures/index.ts`, `pages/LoginPage.ts`, `setup/seed.setup.ts`, `setup/auth.setup.ts`, `tests/smoke.spec.ts`

**Interfaces:**
- Consumes: `credentialsFor`, `totp`, `quarantineKey`, `loadQuarantine` y `quarantineAction` del Task 2.
- Produces:
  - `qa.config.ts` exporta `qa: QaConfig` con `QaConfig = { baseURL: string; roles: string[]; loginPath: string; resetPath: string | null; webServer?: { command: string; url: string; env?: Record<string,string> } }`. Valores por defecto: `baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000'`, `roles: ['user']`, `loginPath: '/login'`, `resetPath: '/__test__/reset'`.
  - `authFile(role: string): string` devuelve la ruta absoluta a `e2e/.auth/<role>.json`.
  - `fixtures/index.ts` exporta `test` y `expect`. `test` agrega la opción `role` (por defecto `qa.roles[0]`), `storageState` derivado de `authFile(role)` y una fixture auto `quarantine` que llama a `quarantineAction(quarantineKey(testInfo.titlePath), loadQuarantine(...), mode)` con `mode = process.env.E2E_QUARANTINE_MODE === 'only' ? 'only' : 'exclude'`. Si el resultado es `skip`, hace `test.skip(true, 'quarantined')`. Además anota **todos** los tests con `{ type: 'qa-key', description: <clave> }`, para que la clave quede en `results.json`: el Plan C la usa como id estable del test. Los specs de los clientes importan siempre desde `../fixtures`.
  - `LoginPage` con `constructor(page: Page)`, `goto()` y `login(c: Credentials, role: string): Promise<void>`. Llena `getByLabel('Email')` y `getByLabel('Password')`, y el campo `getByLabel(/code/i)` si hay `totpSecret`. Hace clic en `getByRole('button', { name: /sign in|log in/i })` y luego valida `expect(page, \`Login failed for role "${role}"\`).not.toHaveURL(new RegExp(qa.loginPath))`.
- `playwright.config.ts`:
  - Si existe `e2e/.env`, lo carga con `process.loadEnvFile`.
  - Fija `outputDir: 'test-results'`, `forbidOnly: !!process.env.CI` y `retries: process.env.CI ? 2 : 0`.
  - `reporter`: `[['list'], ['json', { outputFile: 'results/results.json' }], ['html', { open: 'never', outputFolder: 'playwright-report' }]]`.
  - `use`: `baseURL: qa.baseURL`, `trace: 'retain-on-failure'`, `video: 'retain-on-failure'`, `screenshot: 'only-on-failure'`.
  - `webServer`: se toma de `qa.webServer` si está definido, con `reuseExistingServer: !process.env.CI`.
  - `projects`: `seed` (`testMatch: /seed\.setup\.ts/`), luego `auth` (`/auth\.setup\.ts/`, `dependencies: ['seed']`), luego `chromium` (`testDir: 'tests'`, `Desktop Chrome`, `dependencies: ['auth']`).
- `seed.setup.ts`: si `resetPath` es `null`, saltea el test con la anotación `no reset endpoint`. Si no, manda `POST` con el header `x-test-reset-token: process.env.E2E_RESET_TOKEN` y espera 2xx. Si falla, el error incluye el status.
- `auth.setup.ts`: genera un test `authenticate <role>` por cada rol de `qa.roles`, que hace login y guarda el estado con `context().storageState({ path: authFile(role) })`.
- `tests/smoke.spec.ts`: `test('home loads for an authenticated user')`, que va a `/` y valida `not.toHaveURL(/login/)`.
- `.gitignore`: `node_modules/ .auth/ results/ test-results/ playwright-report/ .env`. `.env.example` lista todas las variables `E2E_*` sin valores.
- `README.md` (inglés): cómo instalar (`npm install` y commitear el `package-lock.json`), cómo correr, cómo agregar un rol, la cuarentena y la lista de secretos de CI.

- [ ] **Step 1: Crear los archivos** según las interfaces. En `template/e2e/` ejecutar `npm install` una vez para generar el lock: es parte de la plantilla, porque el workflow usa `npm ci`.
- [ ] **Step 2: Verificar los tipos.** En `template/e2e` ejecutar `npx tsc --noEmit`. Resultado esperado: sin errores.
- [ ] **Step 3: Verificar la estructura.** En `template/e2e` ejecutar `npx playwright test --list`. Resultado esperado: aparecen `[seed]`, `[auth] › authenticate user` y `[chromium] › smoke.spec.ts › home loads for an authenticated user`.
- [ ] **Step 4: Commit** con el mensaje `feat(e2e-template): playwright config, role fixtures, seed/auth setup, login page object`.

(La ejecución real contra una app se valida en el Task 5.)

---

### Task 4: CLI `init`

**Files:**
- Create: `packages/e2e-template/bin/init.mjs`
- Test: `packages/e2e-template/test/init.unit.ts`

**Interfaces:**
- Produces: `initTemplate({ targetDir: string, force?: boolean }): Promise<{ created: string[]; skipped: string[]; overwritten: string[] }>`. Las rutas devueltas son relativas a `targetDir` y usan `/`. Copia el árbol `template/` completo, incluido `.github/`. Excluye `node_modules`, `.auth`, `results`, `test-results`, `playwright-report` y `.env`. Si un archivo ya existe, lo saltea, salvo con `force`.
- Uso por CLI: `node packages/e2e-template/bin/init.mjs <targetDir> [--force]`. Imprime las tres listas y termina con código 1 (y mensaje) si `targetDir` no existe.

- [ ] **Step 1: Escribir los tests que fallan.** Cada uno corre sobre un directorio temporal nuevo creado con `mkdtemp`:

```ts
test('copies e2e/ and the workflow into an empty dir', ...)
  // created incluye 'e2e/playwright.config.ts' y '.github/workflows/e2e.yml'
test('skips existing files and leaves their content untouched', ...)
  // escribir 'e2e/qa.config.ts' = 'mine' → skipped lo incluye, el contenido sigue siendo 'mine'
test('force overwrites existing files', ...)            // overwritten lo incluye y el contenido cambia
test('never copies node_modules, .auth or results', ...)
  // aunque existan en template/, no aparecen en created
test('works with spaces and accents in the target path', ...)  // destino: join(tmp, 'cliente demo ñ')
```

- [ ] **Step 2: Verificar que fallan.** Ejecutar `npm test -w e2e-template`. Resultado esperado: FAIL en los 5 tests nuevos.
- [ ] **Step 3: Implementar `initTemplate`** con `fs.promises.cp` o un recorrido manual con `readdir({ recursive: true })`. Resolver la ruta de la plantilla con `fileURLToPath(new URL('../template/', import.meta.url))`, porque `new URL().pathname` rompe con las tildes.
- [ ] **Step 4: Verificar que pasan.** Ejecutar `npm test -w e2e-template`. Resultado esperado: todos pass.
- [ ] **Step 5: Commit** con el mensaje `feat(e2e-template): init CLI that installs the template into a client repo`.

---

### Task 5: Onboardear la demo-app con la plantilla (validación de punta a punta)

**Files:**
- Generate: `packages/demo-app/e2e/**` vía `init`. Borrar `packages/demo-app/.github/`, porque en el monorepo se usa el `ci.yml` de la raíz.
- Modify: `packages/demo-app/e2e/qa.config.ts`
- Create: `packages/demo-app/e2e/pages/ItemsPage.ts`, `tests/items.spec.ts`, `tests/admin.spec.ts`, `packages/demo-app/e2e/.env.example` (valores demo)

**Interfaces:**
- Consumes: `test`, `expect` (de `fixtures/index.ts`), `LoginPage`, `uniqueName` y `initTemplate` de los tasks anteriores, más las rutas y textos de la demo-app del Task 1.
- `qa.config.ts` de la demo: `roles: ['user', 'admin']`, `webServer: { command: 'node ../src/main.mjs', url: 'http://localhost:3000/login', env: { RESET_TOKEN: process.env.E2E_RESET_TOKEN ?? '' } }`.
- `ItemsPage` con `goto()`, `add(name: string)`, `items(): Locator` (los `listitem`) y `error(): Locator`.

- [ ] **Step 1: Ejecutar `node packages/e2e-template/bin/init.mjs packages/demo-app`.** Resultado esperado: `created` lista `e2e/...` y `skipped` queda vacío.
- [ ] **Step 2: Escribir los specs** (todos importan desde `../fixtures`):

```ts
// items.spec.ts — role 'user' (por defecto)
test('adds an item and shows it in the list')   // name = uniqueName('item'); expect(items()).toContainText([name])
test('rejects an empty item name')              // add('   ') → expect(error()).toHaveText('Name is required')
test('reset restored the seed item')            // expect(items()).toContainText(['Seed item'])
// admin.spec.ts
test.describe('as admin', () => { test.use({ role: 'admin' }); test('sees the admin page') })  // heading 'Admin'
test('user is forbidden from admin')            // goto('/admin') → getByText('Forbidden') visible
```

- [ ] **Step 3: Correr la suite.** Copiar `.env.example` a `.env` en `packages/demo-app/e2e` (valores: `E2E_USER_EMAIL=user@demo.test`, `E2E_USER_PASSWORD=user-pass`, `E2E_ADMIN_EMAIL=admin@demo.test`, `E2E_ADMIN_PASSWORD=admin-pass`, `E2E_RESET_TOKEN=local-reset`) y ejecutar `npm ci && npx playwright install chromium && npx playwright test`. Resultado esperado: seed y auth (2) pasan; smoke, items (3) y admin (2) pasan; existe `results/results.json`.
- [ ] **Step 4: Verificar la cuarentena.** Copiar la clave del test "adds an item and shows it in the list" desde su anotación `qa-key` en `results/results.json` (no escribirla a mano) y agregarla a `quarantine.json`, y ejecutar `npx playwright test`. Resultado esperado: ese test sale como `skipped` con la anotación `quarantined` y el resto pasa. Después ejecutar con `E2E_QUARANTINE_MODE=only`: solo ese test corre. Al terminar, volver a dejar `[]`.
- [ ] **Step 5: Verificación negativa (Review Focus 4).** Ejecutar con `E2E_USER_PASSWORD=wrong`. Resultado esperado: falla `authenticate user` con `Login failed for role "user"` y los tests de `chromium` no corren (no se reportan como passed).
- [ ] **Step 6: Verificar el reset (Review Focus 3).** Ejecutar con `E2E_RESET_TOKEN=wrong`. Resultado esperado: el proyecto `seed` falla y el mensaje incluye `403`.
- [ ] **Step 7: Volcar los hallazgos en la plantilla.** Todo cambio que la demo haya necesitado en un archivo genérico se aplica en `template/` y se vuelve a ejecutar `npm test -w e2e-template`.
- [ ] **Step 8: Commit** con el mensaje `test(demo-app): onboard client zero with the e2e template`.

---

### Task 6: Workflows de GitHub Actions

**Files:**
- Create: `packages/e2e-template/template/.github/workflows/e2e.yml`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: las rutas fijas y el contrato del webhook (ver la hoja de ruta).
- `e2e.yml` (el que recibe el cliente) debe cumplir:
  - `on`: `pull_request`, `schedule: - cron: '0 6 * * *'` y `workflow_dispatch`.
  - `defaults.run.working-directory: e2e`.
  - Job **`e2e`** (bloqueante): `actions/checkout`, `actions/setup-node` con `node-version: 22` y `cache: npm` (`cache-dependency-path: e2e/package-lock.json`), `npm ci`, `npx playwright install --with-deps chromium` y `npx playwright test`. Las variables `E2E_BASE_URL`, `E2E_RESET_TOKEN` y `E2E_<ROL>_*` se leen de `secrets`.
    - `actions/upload-artifact` con `if: always()`, nombre `e2e-artifacts` y rutas `e2e/playwright-report`, `e2e/test-results` y `e2e/results`.
    - Paso de ingesta con `if: always() && secrets.QA_INGEST_URL != ''`, implementado mapeando el secreto a `env` y chequeando `env.QA_INGEST_URL != ''`, porque `secrets` no está disponible en `if`. Usa `continue-on-error: true` y hace `curl --fail -X POST` con los headers exactos del contrato. `X-QA-Run-Kind` se deriva de `github.event_name`: `pull_request` → `pr`, `schedule` → `nightly` y cualquier otro → `manual`.
  - Job **`quarantine`**: `continue-on-error: true`, mismos pasos con `E2E_QUARANTINE_MODE: only` y nombre de artifact `e2e-quarantine-artifacts`.
- `ci.yml` (monorepo): en `push` y `pull_request` corre `npm ci` en la raíz y `npm run test:unit`, y después, en `packages/demo-app/e2e`, `npm ci`, la instalación de chromium y `npx playwright test` con las variables demo en `env` (no son secretos reales).

- [ ] **Step 1: Escribir los dos workflows** según lo de arriba.
- [ ] **Step 2: Correr un lint.** Ejecutar `npx --yes @action-validator/cli .github/workflows/ci.yml` y lo mismo con el `e2e.yml` de la plantilla. Si hay `actionlint` instalado, preferirlo. Resultado esperado: sin errores.
- [ ] **Step 3: Verificar en GitHub (manual, lo hace el dueño del repo).** Crear un repo privado, hacer push y abrir un PR. Resultado esperado: `ci.yml` en verde.
- [ ] **Step 4: Verificar el `e2e.yml` real.** En un segundo repo privado de prueba que contenga solo la demo-app, ejecutar `init` y dejar el `e2e.yml` sin tocar (cargando los secrets demo). Abrir un PR: el job `e2e` debe quedar verde y debe aparecer el artifact `e2e-artifacts`. Después cargar `QA_INGEST_URL=https://invalid.example` y re-ejecutar: el paso de ingesta falla, pero el job sigue en verde (Review Focus 5).
- [ ] **Step 5: Commit** con el mensaje `ci: client e2e workflow template and monorepo CI`.

---

### Task 7: Runbook de onboarding y página de manejo de datos

**Files:**
- Create: `docs/runbook/onboarding.md` (español, interno), `docs/runbook/data-handling.md` (inglés, para enviar al cliente)

**Contenido requerido:**
- `onboarding.md` es un checklist en orden:
  1. NDA y DPA firmados.
  2. URL de staging.
  3. Un usuario de prueba dedicado por rol, sin datos personales reales.
  4. MFA: bypass en staging o secreto TOTP en `E2E_<ROL>_TOTP_SECRET`.
  5. Endpoint de reset con el contrato exacto del Task 1: `POST`, header `x-test-reset-token`, 2xx, idempotente, solo en staging y 404 si está deshabilitado. Alternativa: un script de seed.
  6. Acceso a GitHub solo vía PR, con branch protection.
  7. La tabla completa de secrets y variables a cargar (`E2E_BASE_URL`, `E2E_RESET_TOKEN`, `E2E_<ROL>_EMAIL`, `_PASSWORD`, `_TOTP_SECRET`, `QA_INGEST_URL`, `QA_INGEST_TOKEN` y la variable `QA_CLIENT_ID`).
  8. Ejecutar `init`, luego `npm install` y commitear el lock.
  9. Lista acordada de flujos críticos (máximo según el plan: 10, 25 o 50).
  10. Primer PR con smoke y el primer flujo.
  11. Planilla de horas por cliente por semana, iniciada el día 1.
  - Una sección de "qué NO incluye" copiada del PDF: pruebas de carga, pentesting, certificación de accesibilidad y QA manual ilimitado.
- `data-handling.md` (una página): acceso solo a staging, secretos que viven en el CI del cliente, qué datos guardamos (resultados de tests y artefactos), dónde (Cloudflare) y cuánto tiempo (fijar 90 días), eliminación al terminar el contrato y que los tests son propiedad del cliente.

- [ ] **Step 1: Escribir ambos documentos.**
- [ ] **Step 2: Ensayo en seco.** Recorrer `onboarding.md` paso a paso tratando a la demo-app como cliente (en el repo de prueba del Task 6). Resultado esperado: cada paso se puede completar sin información que no esté en el runbook. Corregir lo que falte.
- [ ] **Step 3: Commit** con el mensaje `docs: client onboarding runbook and data-handling one-pager`.

---

## Criterio de terminado del Plan A

- `npm run test:unit` en verde: los helpers, `init` y el servidor de la demo-app.
- Suite e2e de la demo-app en verde, en local y en GitHub Actions, usando el `e2e.yml` generado por `init` sin modificaciones.
- Las cinco verificaciones de Review Focus ejecutadas y con el resultado esperado.
- Un desarrollador ajeno puede onboardear un repo nuevo siguiendo solo `onboarding.md` y el README de la plantilla.
