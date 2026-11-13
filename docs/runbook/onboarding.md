# Runbook de onboarding de un cliente

Uso interno. Seguilo en orden. Cada paso tiene un "listo cuando" que se puede comprobar.
Objetivo: los primeros flujos críticos corriendo en el CI del cliente dentro de las 2 semanas.

## 0. Antes de tocar nada

- [ ] **Contrato, NDA y DPA firmados.** El contrato dice que el código de los tests es del cliente.
- [ ] **Alcance escrito** (plan Starter, Growth o Scale) con lo que **NO** incluye: pruebas de carga, pentesting, certificación de accesibilidad y QA manual ilimitado.
- [ ] **Página de manejo de datos enviada** ([data-handling.md](data-handling.md)).
- [ ] **Planilla de horas del cliente creada.** Anotá desde hoy las horas por semana. Es la métrica que dice si el negocio escala (umbral: más de 60 horas/mes por cliente).

Listo cuando: hay documentos firmados y la planilla existe.

## 1. Entorno

- [ ] **URL de staging** (`E2E_BASE_URL`). Nunca producción. **Sin credenciales en la URL** (`https://usuario:clave@...`): la plantilla la rechaza porque Playwright escribe `baseURL` en los reportes. Si staging tiene basic auth, pedí una allowlist de IPs para los runners de CI o una URL sin basic auth. El soporte de basic auth sin filtrarlo todavía no está implementado.
- [ ] **Staging aislado de datos reales.** Preguntá explícitamente: "¿staging comparte base de datos, emails o pagos con producción?". Si comparte, se resuelve antes de seguir.
- [ ] **Emails y pagos en modo prueba** (sandbox de Stripe, email catcher o similar), si los flujos críticos los tocan.

Listo cuando: podés abrir staging en el navegador y no hay forma de que un test afecte a usuarios reales.

## 2. Usuarios de prueba

- [ ] **Un usuario dedicado por rol** (por ejemplo `user`, `admin`), con emails tipo `qa+admin@cliente.com` y sin datos personales reales.
- [ ] **Credenciales cargadas como secrets del repo**, nunca por chat ni por email en texto plano: `E2E_<ROL>_EMAIL` y `E2E_<ROL>_PASSWORD`. El rol `power-user` se escribe `E2E_POWER_USER_*`.
- [ ] **MFA**, si los usuarios lo tienen. Una de dos:
  - bypass de MFA en staging para los usuarios de prueba (preferido), o
  - secreto TOTP del usuario de prueba (base32) en `E2E_<ROL>_TOTP_SECRET`. El campo del código se busca por su label con `TOTP_LABEL` (`e2e/pages/login-labels.ts`): acepta "Code", "Authentication code", "6-digit code" y similares, pero no "Promo code" ni "Recovery code". Si el label del cliente es otro, se ajusta ahí.

Listo cuando: podés entrar a mano con cada usuario.

## 3. Datos de prueba (negocialo acá: sin esto los tests son frágiles)

Opción preferida: un **endpoint de reset** en staging con este contrato:

| Aspecto | Requisito |
|---|---|
| Método y ruta | `POST /__test__/reset` (u otra ruta, configurable en `resetPath`) |
| Autenticación | header `x-test-reset-token: <E2E_RESET_TOKEN>`. Si el token es incorrecto, responde 403 |
| Respuesta | 2xx cuando terminó el reset |
| Efecto | deja los datos de prueba en un estado conocido. Idempotente. No cierra sesiones |
| Seguridad | existe **solo** en staging. Si el token no está configurado, responde 404 |

- [ ] El endpoint existe y `E2E_RESET_TOKEN` está cargado como secret, **o**
- [ ] alternativa: se acuerda un script de seed o datos fijos. En ese caso, `resetPath: null` en `qa.config.ts`, y cada test crea sus propios datos con `uniqueName()`.

Listo cuando: `curl -X POST -H "x-test-reset-token: ..." <staging>/__test__/reset` devuelve 2xx.

## 4. Acceso a GitHub

- [ ] **Acceso de escritura limitado**: trabajamos solo por PR, nunca push directo a la rama principal.
- [ ] **Branch protection** en la rama principal, con el check `E2E (blocking)` como requerido. Se activa recién cuando la suite está estable (paso 7).
- [ ] **Actions habilitado** en el repo.
- [ ] Si el repo es **público**, avisar que los traces no se suben como artifact (contienen cookies de sesión de staging), solo `results/`.

Listo cuando: podés abrir un PR en el repo del cliente.

## 5. Instalar la plantilla

En una rama nueva del repo del cliente:

```bash
node <qa_proyect>/packages/e2e-template/bin/init.mjs <ruta-al-repo-del-cliente>
cd <ruta-al-repo-del-cliente>/e2e
npm install                      # genera package-lock.json: se commitea
npx playwright install chromium
cp .env.example .env             # valores locales; .env nunca se commitea
```

- [ ] **Editar `e2e/qa.config.ts`**: `roles`, `loginPath` y `resetPath`. `baseURL` viene de `E2E_BASE_URL`.
- [ ] **Ajustar los locators de `e2e/pages/LoginPage.ts`** si el formulario no usa los labels "Email" y "Password" o un botón "Sign in"/"Log in".
- [ ] **Correr `npx playwright test` en local**: el seed, el auth de cada rol y el smoke tienen que pasar.

Listo cuando: el smoke pasa en local contra staging.

## 6. Secrets y variables de CI

Se cargan en *Settings → Secrets and variables → Actions* del repo del cliente:

| Nombre | Tipo | Obligatorio | Valor |
|---|---|---|---|
| `E2E_BASE_URL` | secret | sí | URL de staging |
| `E2E_<ROL>_EMAIL` | secret | sí, por rol | email del usuario de prueba |
| `E2E_<ROL>_PASSWORD` | secret | sí, por rol | contraseña del usuario de prueba |
| `E2E_<ROL>_TOTP_SECRET` | secret | si hay MFA sin bypass | secreto base32 |
| `E2E_RESET_TOKEN` | secret | si hay `resetPath` | token del endpoint de reset |
| `QA_INGEST_URL` | secret | cuando exista el backend (Plan C) | URL del webhook de ingesta |
| `QA_INGEST_TOKEN` | secret | cuando exista el backend (Plan C) | token del cliente para la ingesta |
| `QA_CLIENT_ID` | **variable** | cuando exista el backend (Plan C) | id corto del cliente, por ejemplo `acme` |

Listo cuando: el workflow `E2E` corre verde en el primer PR.

## 7. Flujos críticos

- [ ] **Lista acordada con el cliente**, priorizada por "qué nos duele más si se rompe". Máximo según el plan: Starter 10, Growth 25 o Scale 50.
- [ ] **Primer PR**: plantilla, smoke y el flujo número 1. Lo revisa alguien del cliente.
- [ ] **Siguientes PRs**: de a 2 o 3 flujos, cada uno verde en CI antes de mergear.
- [ ] **Branch protection con `E2E (blocking)`** cuando la suite lleve una semana estable de nightly.

Reglas al escribir tests:
- importar siempre desde `../fixtures`;
- usar locators por rol o label;
- crear datos propios con `uniqueName()`;
- nada de `waitForTimeout`.

## 8. Operación continua

- **Flaky:** un test que aparece como flaky de forma repetida va a `quarantine.json` por PR, con su clave tomada de la anotación `qa-key` de `results/results.json`. El job no bloqueante `E2E (quarantined)` lo sigue corriendo hasta arreglarlo.
- **Cambio de UI que rompe tests:** el agente propone el arreglo y una persona lo aprueba antes del PR.
- **Horas:** se cargan en la planilla todas las semanas, sin excepción.
