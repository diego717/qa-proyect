# Checklists de exploración

Son el criterio que sigue el agente cuando recorre una app. **Son tuyos:** editalos, agregá ítems y sacá los que no sirvan. Cada hallazgo del modelo tiene que citar el ítem que lo originó (por ejemplo `formularios#4`). Así, con el tiempo, ves qué ítems encuentran problemas reales.

## Formato de un ítem

```markdown
### 4. Título corto del ítem
- **Qué mirar:** qué hacer y qué observar, concreto.
- **Por qué importa:** qué le pasa al usuario o al negocio si falla.
- **Fuente:** [De dónde sale la práctica](https://...)
```

- El número identifica al ítem dentro del archivo: no lo cambies una vez usado, porque los hallazgos viejos lo citan.
- La fuente tiene que ser un link real. Si un ítem es criterio propio, explicalo en "Por qué importa" y citá la fuente más cercana.
- `npm test -w explorer` verifica que todos los ítems tengan los tres campos.

## Archivos

| Archivo | Para qué flujos |
|---|---|
| `login-sesion.md` | Iniciar y cerrar sesión, recuperar contraseña |
| `registro.md` | Alta de cuenta, invitaciones |
| `formularios.md` | Cualquier formulario |
| `busqueda-filtros.md` | Búsquedas, filtros, listados y paginación |
| `navegacion-contenido.md` | Navegación general y páginas de contenido |
| `flujos-varios-pasos.md` | Checkout, reservas, asistentes de varios pasos |
| `responsive.md` | Uso en celular |
| `mensajes-error.md` | Errores, páginas 404, estados vacíos |
