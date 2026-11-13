# Runbook: auditoría de muestra para un prospecto

Uso interno. Seguilo en orden. Herramientas: `packages/explorer` (escáner, revisión e informe) y la skill `packages/explorer/skills/explorar-auditoria` (exploración con el modelo).
Diseño completo: `docs/superpowers/specs/2026-11-12-agente-explorador-design.md`.

En este runbook, `<id>` es el identificador corto del prospecto: minúsculas, números y guiones (por ejemplo `acme-uy`). Es la carpeta `audits/<id>/`, la rama `audit/<id>` y el prefijo de sus secrets `AUDIT_ACME_UY_*`.

## 1. Autorización escrita (antes de tocar nada)

Sin esto no se audita. Mandale al prospecto este texto, adaptado, y guardá su respuesta afirmativa por escrito (email):

> Hola, [nombre]:
>
> Para preparar la auditoría de muestra de [app] necesitamos tu autorización para:
>
> - **Qué vamos a revisar:** [URL] y los flujos [lista], entre el [fecha] y el [fecha].
> - **Entorno:** [staging / producción]. En producción trabajamos en modo solo lectura: recorremos la app, pero no enviamos formularios ni confirmamos acciones (compras, altas, envíos, borrados).
> - **Usuario de prueba:** necesitamos un usuario dedicado a esta auditoría, sin datos de clientes reales, que des de baja al terminar. Las credenciales nos llegan por un canal seguro, nunca por chat ni email en texto plano.
> - **Tus datos:** guardamos capturas de pantalla y hallazgos en un repositorio privado, solo accesible por nosotros, y los borramos a más tardar 30 días después de entregarte el informe.
> - **Contacto:** si algo se rompe o te llama la atención durante la auditoría, escribile a [tu contacto].
>
> ¿Nos confirmás por este medio que estás de acuerdo?

Listo cuando: hay una respuesta afirmativa escrita, con fecha, alcance y quién la dio.

## 2. Rama y perfil

```bash
git checkout main && git pull
git checkout -b audit/<id>
mkdir audits/<id>
cp audits/example/target.yaml audits/<id>/target.yaml
```

Editá `audits/<id>/target.yaml`. Cada campo está explicado en el archivo:

- `name`, `base_url` (sin usuario ni contraseña en la URL), `mode` (`staging` o `read-only`; si dudás, `read-only`);
- `login`: `email_env: AUDIT_<ID>_EMAIL` y `password_env: AUDIT_<ID>_PASSWORD`, con `<ID>` en mayúsculas y guiones bajos (`acme-uy` → `AUDIT_ACME_UY_EMAIL`). El perfil solo acepta esos nombres exactos. Ajustá `labels` si el formulario de login usa otros textos;
- `scope.start` y `scope.flows` (lo que pidió el prospecto);
- `authorization`: quién autorizó, la fecha y el alcance (del paso 1).

Commiteá y subí la rama: `git add audits/<id> && git commit -m "audit(<id>): profile" && git push -u origin audit/<id>`.

**Nunca mergees una rama `audit/*` a `main` ni abras un PR con ella:** tiene datos del prospecto.

Listo cuando: la rama `audit/<id>` está en GitHub con el perfil.

## 3. Secrets

En GitHub: *Settings → Secrets and variables → Actions → New repository secret*:

| Nombre | Valor |
|---|---|
| `AUDIT_<ID>_EMAIL` | email del usuario de prueba |
| `AUDIT_<ID>_PASSWORD` | contraseña del usuario de prueba |
| `AUDIT_<ID>_TOTP_SECRET` | solo si el usuario tiene MFA: el secreto base32 |

El workflow carga solo esos tres nombres para esa auditoría. Nunca ve los de otro prospecto.

## 4. Escaneo automático

GitHub → *Actions → Audit scan → Run workflow*, con `audit_id` = `<id>`.

- Tarda unos minutos. Al terminar, commitea `findings/` y `evidence/` en la rama `audit/<id>`.
- Si termina en rojo con "blocked", seguí el paso 9.

Para correrlo en tu máquina, en lugar de GitHub:

```bash
export AUDIT_<ID>_EMAIL=... AUDIT_<ID>_PASSWORD=...   # en la terminal, nunca en un archivo commiteado
npm run explorer -w explorer -- scan audits/<id>
```

## 5. Exploración con el modelo

1. Guardá la sesión del usuario de prueba (el agente nunca escribe la contraseña):
   ```bash
   npm run explorer -w explorer -- login audits/<id>
   ```
   Queda en `audits/<id>/.auth/session.json`, ignorado por git.
2. Abrí Claude Code en la rama `audit/<id>` y pedile: *"Usá la skill de `packages/explorer/skills/explorar-auditoria/SKILL.md` para explorar `audits/<id>`"*.
   - En la nube (claude.ai/code) o en tu máquina, según el resultado de la prueba del Plan B (`docs/superpowers/specs/2026-11-12-agente-explorador-design.md`, §4.3). Si en la nube no se puede abrir el navegador o llegar a la app, hacelo en tu máquina.
3. El agente escribe `findings/observed.json` y `summary.md`, y corre `validate-observed` hasta que no haya errores.

Listo cuando: `npm run explorer -w explorer -- validate-observed audits/<id>` dice "valid".

## 6. Revisión (tu parte)

```bash
npm run explorer -w explorer -- review-file audits/<id>
```

Abrí `audits/<id>/review.yaml`:

- **Hallazgos del modelo** (`pending_review`): para cada uno, abrí la evidencia y seguí los pasos en la app. Después:
  - `confirmed` si lo reproducís;
  - `rejected` con `note` (el motivo) si no se reproduce o no es un problema;
  - `needs_info` si necesitás algo más (no entra en el informe hasta resolverlo).
- **Hallazgos medidos** (`not_required`): entran solos. Marcá `rejected` con motivo solo si son ruido (por ejemplo, un error que el prospecto ya conoce).

Editá `audits/<id>/summary.md`: es la primera página del informe, para alguien no técnico. Tiene que decir qué se revisó, los 3 a 5 problemas que más importan explicados por su impacto, y qué no se revisó.

Esta es la parte donde más se aprende: cada hallazgo trae el ítem del checklist que lo originó, y el informe explica el porqué de cada tipo. Si un ítem no sirve o falta uno, editá `packages/explorer/checklists/` en `main` (no en la rama de la auditoría).

Commiteá `review.yaml` y `summary.md` en la rama `audit/<id>` y subilos.

## 7. Informe y entrega

GitHub → *Actions → Audit report → Run workflow*, con `audit_id` = `<id>`. O en tu máquina: `npm run explorer -w explorer -- report audits/<id>`.

- Si quedan hallazgos sin decidir, falla y dice cuáles.
- El informe queda en `audits/<id>/report/informe.html` y como artifact del workflow. Abrilo en el navegador, revisalo entero y exportalo a PDF (Imprimir → Guardar como PDF).

Al entregarlo, completá `delivered_on: AAAA-MM-DD` en `target.yaml`, commiteá y subilo. Desde esa fecha corren los 30 días.

Pedile al prospecto que dé de baja el usuario de prueba.

## 8. Borrado a los 30 días

El workflow *Audit retention* corre todos los lunes y lista las auditorías vencidas en su resumen (termina en rojo si hay alguna). **No borra nada solo.** Para cada una:

```bash
git push origin --delete audit/<id>
git branch -D audit/<id>
rm -rf audits/<id>        # si quedó la carpeta en tu máquina (incluye .auth/)
```

Borrá también los secrets `AUDIT_<ID>_*` en GitHub y los artifacts de las corridas de esa auditoría (Actions → la corrida → Artifacts). Avisale al prospecto por escrito que sus datos fueron borrados.

## 9. Si el escaneo queda bloqueado

El motivo está en `audits/<id>/findings/measured.json`, en `blockedReason`:

| Motivo | Qué hacer |
|---|---|
| `Missing audit credentials: set AUDIT_...` | Falta un secret del paso 3, o el nombre no coincide. |
| `Login failed for audit target "<id>"` | Probá entrar a mano con ese usuario. Si funciona, el formulario usa otros textos: ajustá `login.labels` en el perfil. Si no, pedile al prospecto que revise el usuario. |
| `No page could be scanned: session lost` | La app cerró la sesión enseguida. Revisá `scope.start`: tiene que ser una página a la que el usuario tenga acceso. |
| `No page could be scanned: redirect ...` | La página de inicio redirige a algo prohibido o fuera de alcance. Revisá `scope.start` e `include`. |
| `did not load` | La app no responde desde GitHub. Puede tener una allowlist de IPs: corré el escaneo en tu máquina o pedí acceso. |
