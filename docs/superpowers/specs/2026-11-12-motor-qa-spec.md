# Spec: motor interno de QA gestionado

Fuente: "Plan de arranque: QA gestionado por suscripción" (PDF, Montevideo, noviembre de 2026).
Este documento extrae solo los requisitos técnicos. La oferta, la venta y lo legal quedan en el PDF.

## Qué es

No es un SaaS. Es un kit interno que permite atender a 4–8 clientes sin morir en horas.
El cliente recibe valor por Slack, PRs e informe en PDF.

## Principios no negociables

1. **"Los tests son tuyos":** los tests viven en el repo del cliente, en Playwright estándar. Si el cliente se va, se los queda. Nada de runtime propietario dentro de sus tests.
2. **Los tests corren en el CI del cliente** (GitHub Actions), no en infraestructura propia: el cómputo lo paga el cliente, no manejamos sus secretos de producción y el cliente ve el valor en su propio flujo de trabajo.
3. **Nuestra infraestructura solo guarda resultados e informes** (Cloudflare Workers + D1 + R2).
4. **Acceso:** solo staging, solo lectura donde sea posible, secretos siempre en el CI del cliente.
5. **Flakiness:** reintentos con registro, cuarentena automática de tests inestables, nunca bloquear un PR por un flaky conocido.
6. **No construir todavía:** login multicliente sofisticado, facturación automática, panel bonito para el cliente, soporte móvil.

## Arquitectura

```
Repo del cliente
└─ /e2e ← tests Playwright estándar + fixtures + page objects
   └─ CI del cliente (GitHub Actions) corre en cada PR y nightly
        │ resultados (JSON, trazas, videos)
        ▼
Backend propio (Cloudflare Workers + D1 + R2)
├─ Ingesta de resultados por webhook
├─ Detector de flakiness (historial por test)
├─ Cola de triage (falla real / flaky / cambio esperado)
├─ Generador de informe semanal (LLM + datos)
└─ Panel simple propio (+ vista de solo lectura para el cliente)

Agente explorador (máquina propia o CI)
└─ Claude + Playwright MCP/CLI: recorre la app, propone tests nuevos,
   detecta regresiones visuales y redacta bugs reproducibles
```

## Componentes por prioridad

| # | Componente | Para qué | Cuándo |
|---|---|---|---|
| 1 | Plantilla de repo e2e | Config Playwright, fixtures de login (`storageState`), seed de datos, page objects, workflow de GitHub Actions listo para copiar | Semana 1–2 |
| 2 | Runbook de onboarding | Checklist: staging, usuarios de prueba por rol, reset de datos, acceso de solo lectura, NDA | Semana 1–2 |
| 3 | Agente explorador | Prompt + skills para recorrer la app, listar flujos y generar el primer borrador de tests | Semana 2–3 |
| 4 | Ingesta de resultados + triage | Worker que recibe el reporte JSON de Playwright, guarda en D1, artefactos en R2 y marca flaky por historial | Semana 3–5 |
| 5 | Informe semanal | Resumen para no técnicos: qué se probó, qué falló, riesgo del release, tendencia | Semana 4–6 |
| 6 | Creación de bugs | Bug reproducible (pasos, video, traza, entorno) directo en Jira/Linear/GitHub Issues del cliente | Semana 6–8 |
| 7 | Regresión visual y accesibilidad básica | Screenshots comparados + axe-core en los flujos ya cubiertos | Mes 3+ |

## Problemas difíciles (donde está el valor)

- **Autenticación y estado:** usuarios de prueba por rol, `storageState` reutilizable, MFA (bypass en staging o TOTP de prueba).
- **Datos de prueba:** endpoint o script de seed/reset. Sin esto los tests son frágiles.
- **Flakiness:** ver principio 5.
- **Mantenimiento:** cuando la UI cambia, el agente propone el arreglo y un humano lo aprueba. Medir horas por semana por cliente.

## Métricas que el motor debe permitir medir

- Horas por cliente por semana (umbral de abandono: más de 60 horas/mes por cliente).
- Tests mantenidos por cliente, % flaky, bugs reales encontrados por mes.
