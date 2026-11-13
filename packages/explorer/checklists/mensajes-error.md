# Mensajes de error y estados

### 1. El mensaje dice qué pasó y cómo seguir
- **Qué mirar:** cada error que aparezca durante la exploración. ¿Está en el idioma del usuario, sin jerga técnica, y dice qué hacer ahora?
- **Por qué importa:** "Error 500" o "Algo salió mal" no ayudan a nadie. Un buen mensaje evita un ticket de soporte.
- **Fuente:** [Nielsen Norman Group: Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/)

### 2. No se muestran detalles técnicos internos
- **Qué mirar:** que los errores no muestren trazas de código, consultas SQL, rutas de archivos del servidor ni versiones de software.
- **Por qué importa:** esos detalles no le sirven al usuario y le dan información a un atacante.
- **Fuente:** [OWASP: Error Handling Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html)

### 3. La página "no encontrada" ayuda a seguir navegando
- **Qué mirar:** abrir una URL inventada dentro del sitio. ¿Se ve el menú del sitio y hay links útiles (inicio, búsqueda)?
- **Por qué importa:** quien llega a un link roto desde un email o un buscador tiene que poder seguir en el sitio en lugar de irse.
- **Fuente:** [Nielsen Norman Group: 10 heurísticas de usabilidad](https://www.nngroup.com/articles/ten-usability-heuristics/)

### 4. Los mensajes de estado se anuncian
- **Qué mirar:** mensajes que aparecen sin recargar la página ("Guardado", "3 resultados"). En DevTools: ¿tienen `role="status"`, `role="alert"` o `aria-live`?
- **Por qué importa:** sin eso, quien usa lector de pantalla no se entera de que la acción funcionó o falló.
- **Fuente:** [WCAG 2.1: 4.1.3 Mensajes de estado](https://www.w3.org/WAI/WCAG21/Understanding/status-messages)

### 5. Una falla de red no deja la pantalla colgada
- **Qué mirar:** en DevTools, poner la red en "Offline" o en "Slow 3G" y usar una acción que cargue datos. ¿Muestra un indicador de carga y después un error con opción de reintentar?
- **Por qué importa:** en el celular la conexión falla seguido. Una pantalla que gira para siempre se lee como que la app está rota.
- **Fuente:** [Nielsen Norman Group: Visibility of System Status](https://www.nngroup.com/articles/visibility-system-status/)
