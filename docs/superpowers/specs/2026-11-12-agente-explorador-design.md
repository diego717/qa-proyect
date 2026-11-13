# Diseño: agente explorador v0 (Plan B)

**Estado:** borrador para aprobar · **Fecha:** 2026-11-12
**Depende de:** Plan A (plantilla e2e, demo-app). **Spec general:** `2026-11-12-motor-qa-spec.md`.

## 1. Para qué es

Producir la **auditoría de muestra**: un informe detallado, en español, sobre la app de un prospecto (mercado inicial: Uruguay), para mostrarle qué encontraríamos si nos contrata. Es la herramienta de venta de la semana 3 del plan comercial.

Dos propósitos con el mismo peso:

1. **Automatizar todo lo posible.** Diego hace a mano solo lo que necesita criterio humano.
2. **Que Diego aprenda QA haciéndolo.** Tiene poca experiencia de campo. El sistema tiene que mostrar cómo funciona cada chequeo y por qué importa, y su criterio tiene que poder crecer en archivos que él edita. No tiene que depender de "lo que dijo el modelo".

## 2. Principios (decididos por Diego)

1. **Hechos separados de opiniones.** Todo hallazgo es de uno de dos tipos:
   - **medido:** lo produce código determinístico, por ejemplo "esta URL respondió 500". Se repite igual en cada corrida;
   - **observado por el modelo:** lo propone el agente explorando, por ejemplo "el botón Guardar no da feedback". El informe lo marca así siempre.
2. **Cada hallazgo trae evidencia revisable:** URL, pasos para reproducirlo, screenshot y, si aplica, el trace de Playwright. Sin evidencia no entra en el informe.
3. **El criterio vive en archivos editables.** Los checklists que sigue el agente son markdown en el repo. Diego los mejora; el prompt no es la fuente de verdad.
4. **Enseñar mientras se usa.** Cada ítem de checklist y cada tipo de hallazgo explica qué es, por qué importa (impacto en usuario o negocio) y de dónde sale la práctica: WCAG, heurísticas de Nielsen, OWASP, guías de Playwright.

## 3. Objetivos, no-objetivos y anti-objetivos

**Objetivos v0**
- Crear un perfil por prospecto, disparar la auditoría y recibir un informe en HTML imprimible a PDF, con poco trabajo manual.
- Chequeos medidos: links e imágenes rotos, errores de consola y de JavaScript, respuestas 4xx/5xx, accesibilidad (axe-core), tiempos de carga, problemas estáticos de formularios (campos sin label, `type` incorrecto) y, solo en staging, formularios que aceptan datos inválidos.
- Exploración por el modelo de los flujos principales, guiada por checklists.
- Un paso de revisión de Diego antes de generar el informe.
- Bugs plantados en la demo-app, con tests que verifiquen que el agente los encuentra.

**No-objetivos v0** (quedan para después)
- Convertir los flujos verificados en specs de la plantilla del Plan A. Es la "yapa" natural, pero va en v1.
- Regresión visual (Plan F), pruebas de carga, pentesting e informe en inglés.
- Panel web. El informe es un archivo.
- Correr el modelo con API key. La v0 usa la suscripción de Claude, pero queda preparada para la API (ver §6).

**Anti-objetivos** (si pasa esto, fracasó aunque funcione)
- Presentar una opinión del modelo como hecho medido.
- Un hallazgo que el prospecto no puede reproducir. Quema la confianza en todo el informe.
- Modificar datos reales en una app de producción: crear, pagar, enviar emails o borrar.
- Que la contraseña del usuario de prueba del prospecto aparezca en un log, un artifact o el informe. Valen las mismas lecciones del Plan A: `fillSecret`, sin `captureGitInfo` y test de filtración.
- Auditar una app sin autorización escrita del prospecto.
- Un informe inflado: contar como fallas las cosas que no se pudieron probar, o repetir el mismo defecto varias veces.

## 4. Cómo funciona una auditoría

```
1. Preparación (Diego)      audits/<prospecto>/target.yaml + secrets del usuario de prueba
2. Escaneo (automático)     GitHub Actions → findings/measured.json + evidencia
3. Exploración (modelo)     sesión de Claude Code → findings/observed.json + evidencia
4. Revisión (Diego)         marca cada hallazgo observado: confirmado / descartado (+ nota)
5. Informe (automático)     HTML en español, dos capas → artifact / PDF
```

### 4.1 Perfil del target (`audits/<prospecto>/target.yaml`)

Idea tomada de `snagly` (licencia MIT). Campos:

| Campo | Para qué |
|---|---|
| `name`, `base_url` | Identificación y punto de entrada |
| `mode` | `staging` (puede completar flujos con datos de prueba) o `read-only` (producción: nunca confirma nada que cree, pague, envíe o borre). **Por defecto `read-only`** |
| `login` | `path`, roles y nombres de las variables de entorno con las credenciales (`AUDIT_<ID>_EMAIL`, `AUDIT_<ID>_PASSWORD`). Nunca los valores |
| `scope` | Páginas de inicio, patrones de URL incluidos y excluidos, máximo de páginas, flujos que el prospecto pidió mirar |
| `never_click` | Patrones extra de links y botones prohibidos. Se suman a una lista fija: logout, delete, remove, cancel subscription, pagar, etc. |
| `known_noise` | Errores conocidos que no cuentan como hallazgo, cada uno con su motivo |
| `authorization` | Quién autorizó, la fecha y el alcance acordado. Sin este campo, la auditoría no arranca |

Los perfiles reales tienen datos de prospectos: el repo tiene que ser privado y se commitea solo `audits/example/`.

### 4.2 Escáner (código determinístico, `packages/explorer`)

- Node + Playwright como librería, con la misma versión fijada que el Plan A.
- Inicia sesión una vez con el `LoginPage` de la plantilla (incluye `fillSecret`) y reusa `storageState`.
- **Crawl de solo lectura:** sigue nada más los `<a href>` del mismo origen dentro de `scope`, por GET, en anchura y hasta `max_pages`. Nunca envía formularios ni hace clicks fuera de la navegación. Los links que coinciden con `never_click` se listan sin visitarse.
- **Chequeos por página:** errores de consola y `pageerror`; requests que fallan (4xx/5xx, separando los del origen de los de terceros); imágenes rotas; links rotos (con un HEAD o GET por link, sin repetir); axe-core vía `@axe-core/playwright`; tiempos (navegación y LCP); análisis estático de formularios.
- **Formularios con datos inválidos:** solo en `mode: staging`, con datos marcados (`uniqueName()`).
- **Salida:** `findings/measured.json`. Cada hallazgo lleva un ID estable (hash de chequeo + URL + selector), el tipo de chequeo, la severidad que da la fuente (por ejemplo, el `impact` de axe), la evidencia y los pasos para reproducir.
- Corre en GitHub Actions con `workflow_dispatch` y el ID del prospecto como input. Cada corrida es independiente: no compara con corridas anteriores.

### 4.3 Exploración (modelo)

- **Skills de Claude Code en `packages/explorer/skills/`.** Son instrucciones, no código. Ideas tomadas de `snagly`:
  - en `read-only`, mirar sin confirmar;
  - cada paso se verifica, no alcanza con "hice click";
  - si algo falla, guardar evidencia y frenar;
  - si no se pudo probar, se marca **bloqueado**, que no es lo mismo que **fallido**;
  - un problema del harness (no se pudo loguear) no se reporta como bug de la app.
- **Checklists en `packages/explorer/checklists/*.md`**, uno por tipo de flujo: login y sesión, alta y registro, formularios, búsqueda y filtros, navegación y contenido, flujos de varios pasos (checkout, reservas), responsive o mobile y mensajes de error. Cada ítem tiene **qué mirar**, **por qué importa** y **fuente**. El agente cita en cada hallazgo el ítem que lo originó.
- Maneja el navegador con Playwright CLI, que guarda la evidencia a disco.
- **Salida:** `findings/observed.json`, con el mismo esquema que `measured.json`, `source: "model"` y estado inicial `pending_review`.
- **Dónde corre:** en una sesión de Claude Code en la nube, con la suscripción de Diego.
  - **Riesgo:** no sabemos si ese entorno permite instalar Chromium y llegar a la URL del prospecto. La primera tarea del plan lo verifica contra la demo-app.
  - **Plan B si falla:** la sesión corre en la máquina de Diego.
  - En cualquier caso, las skills no dependen de dónde se ejecuten.

### 4.4 Revisión (Diego)

- Diego marca cada hallazgo observado: `confirmed` (confirmado), `rejected` (descartado) o `needs_info` (falta información), con una nota opcional. Los medidos no se revisan, pero se pueden descartar con motivo (por ejemplo, ruido conocido).
- El informe incluye solo los medidos no descartados y los observados confirmados. Los descartados se cuentan aparte, para que se pueda revisar el criterio.
- La forma concreta de revisar queda al constructor. Puede ser editar el JSON o una página HTML local con botones. Tiene que ser simple y no necesitar servidor.

### 4.5 Informe (código determinístico)

- Un HTML autocontenido, en español e imprimible a PDF.
- **Capa 1 (una página, para alguien no técnico):**
  - qué se revisó y en qué modo;
  - los 3 a 5 problemas de mayor impacto, en lenguaje de negocio;
  - qué **no** se revisó y por qué (bloqueado, fuera de alcance, modo solo lectura).
- **Capa 2 (detalle):**
  - un hallazgo por fila, con su ID, su tipo (**medido** u **observado por el modelo y confirmado por un revisor**), la severidad de su fuente, los pasos para reproducirlo, la evidencia y la explicación de "por qué importa";
  - contadores separados de probado, fallido y bloqueado.
- El resumen de la capa 1 lo redacta el modelo durante la exploración y Diego lo edita en la revisión. El resto se genera a partir de los JSON.

## 5. Bugs plantados en la demo-app

Cada tipo de chequeo medido tiene al menos un bug plantado en la demo-app, activable con una opción (`createServer({ plantedBugs: true })`) para no romper los tests del Plan A:
- un link roto;
- una imagen rota;
- una ruta que responde 500;
- un error de JavaScript en consola;
- un campo sin label;
- un formulario que acepta datos inválidos (solo staging).

Un test end-to-end del escáner verifica que encuentra todos los bugs plantados y ningún falso positivo en las páginas limpias. Además, la demo-app tiene un link "Eliminar todo" por GET que el crawler **no** debe visitar.

## 6. Restricciones

- Mismas versiones fijadas que el Plan A: Node 22 y `@playwright/test` 1.65.0. Dependencia nueva: `@axe-core/playwright`, con la versión exacta fijada.
- Las skills y los checklists no asumen el entorno de ejecución. Más adelante tienen que poder correr en GitHub Actions con `anthropics/claude-code-action` y una API key, sin reescribirlos.
- **Ninguna credencial en logs, JSON, informes ni artifacts.** Se extiende el test de filtración del Plan A al escáner y al informe.
- Las evidencias contienen datos del prospecto: los artifacts expiran a los 7 días y se suben solo desde repo privado.
- El runbook suma un paso de **autorización escrita del prospecto** antes de auditar: alcance, fechas, staging o producción, usuario de prueba dedicado y quién es el contacto.
- **Retención:** la evidencia y los hallazgos de una auditoría se borran a más tardar 30 días después de entregar el informe. El texto de autorización en español que se le manda al prospecto lo dice, junto con dónde se guardan los datos mientras tanto (repo privado y artifacts de 7 días), y le pide que dé de baja el usuario de prueba al terminar.
- **Recordatorio de borrado:** la rama `audit/<prospecto>` guarda la fecha de entrega en `target.yaml`. Un workflow semanal lista las ramas de auditoría vencidas para que Diego las borre. No las borra solo.

## 7. Decisiones tomadas por Claude al escribir este diseño (Diego las revisa)

- **Dónde viven los datos de una auditoría.** Cada auditoría usa una rama propia `audit/<prospecto>` en este repo, que es privado (verificado). Ahí van el perfil, los hallazgos, la evidencia y la revisión. El escaneo de Actions y la sesión del modelo commitean en esa rama, y Diego revisa ahí. **Nunca se mergea a `main` ni se abre PR**, porque un PR deja referencias permanentes. Después de entregar el informe, la rama se borra **a más tardar 30 días después de la entrega** (plazo decidido por Diego). En `main` solo queda `audits/example/`.
- **Login configurable.** El login del escáner se extrae del `LoginPage` de la plantilla a una función que recibe los labels (email, contraseña, botón y código TOTP) desde `target.yaml`, con los mismos valores por defecto que la plantilla. El MFA se soporta solo con secreto TOTP, como en el Plan A.
- **Límites de la exploración.** Por defecto, hasta 8 flujos por auditoría: primero los que pidió el prospecto y después los que el modelo prioriza. Se puede cambiar en `scope`.
- **Limitación conocida del crawl.** En las SPA que navegan sin `<a href>`, el escáner no llega a esas pantallas, pero la exploración sí. El informe lo dice en "qué no se revisó".
- **Nombre del servicio en el informe.** Va como campo de configuración, `report.brand`, porque el nombre comercial todavía no está definido.

## 8. Decisiones que quedan al constructor

- La librería del crawl y la estrategia de deduplicación de links.
- Los umbrales de "página lenta". Deben salir de una fuente citada, como los umbrales de Core Web Vitals.
- El formato exacto del esquema de hallazgos, siempre que tenga los campos de §4.2.
- La forma de la herramienta de revisión (§4.4).
- El diseño visual del informe.

## 9. Cómo se ve "terminado"

- Contra la demo-app con bugs plantados, el escáner encuentra todos los bugs medibles y no visita el link prohibido.
- Una sesión de exploración contra la demo-app produce hallazgos observados con evidencia y citando ítems de checklist.
- Después de revisar, el informe en HTML se genera, se lee bien impreso y no contiene ninguna credencial (verificado por test).
- Diego puede correr una auditoría de punta a punta siguiendo el runbook, sin ayuda.
