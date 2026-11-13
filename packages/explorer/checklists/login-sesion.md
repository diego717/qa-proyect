# Login y sesión

### 1. El login correcto lleva a donde el usuario esperaba
- **Qué mirar:** entrar con el usuario de prueba desde la página de login y desde un link interno (por ejemplo, una página que pide sesión). Después del login, ¿vuelve a la página que quería ver o lo manda siempre al inicio?
- **Por qué importa:** si después de loguearse el usuario pierde la página que buscaba, tiene que volver a encontrarla. Es fricción en el momento en que más interés tiene.
- **Fuente:** [web.dev: buenas prácticas de formularios de login](https://web.dev/articles/sign-in-form-best-practices)

### 2. El error de credenciales es claro y no revela si el email existe
- **Qué mirar:** el mensaje con una contraseña incorrecta y con un email que no existe. Tiene que entenderse ("email o contraseña incorrectos") y ser el mismo en los dos casos. No lo pruebes con el usuario real del prospecto: usá un email inventado.
- **Por qué importa:** un mensaje distinto para "el email no existe" permite averiguar qué emails tienen cuenta. Un mensaje confuso hace que el usuario no sepa qué corregir.
- **Fuente:** [OWASP: Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

### 3. Hay una forma visible de recuperar la contraseña
- **Qué mirar:** que el link "¿Olvidaste tu contraseña?" esté cerca del formulario y lleve a un flujo que funciona. En modo solo lectura, llegar hasta el formulario sin enviarlo.
- **Por qué importa:** un usuario que no recuerda la contraseña y no encuentra cómo recuperarla es un usuario perdido o un ticket de soporte.
- **Fuente:** [OWASP: Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)

### 4. El formulario se puede usar con teclado y con gestor de contraseñas
- **Qué mirar:** recorrer el login solo con Tab y Enter, y ver que los campos tengan `autocomplete="username"` y `autocomplete="current-password"` (en DevTools).
- **Por qué importa:** quien no usa mouse tiene que poder entrar. Los gestores de contraseñas solo completan bien los formularios bien marcados, y es la forma en que mucha gente usa contraseñas seguras.
- **Fuente:** [WCAG 2.1: 2.1.1 Teclado](https://www.w3.org/WAI/WCAG21/Understanding/keyboard)

### 5. Cerrar sesión termina la sesión de verdad
- **Qué mirar:** solo al final de la exploración (cierra la sesión del agente): cerrar sesión y después usar el botón "atrás" del navegador o abrir una URL interna. No tiene que mostrar datos de la cuenta.
- **Por qué importa:** en una computadora compartida, el siguiente usuario no puede ver la cuenta del anterior.
- **Fuente:** [OWASP: Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

### 6. La sesión vencida avisa y no pierde el trabajo
- **Qué mirar:** si la app tiene un tiempo de sesión corto, dejar una pestaña abierta y volver a usarla. ¿Avisa que la sesión venció y deja volver a entrar sin perder lo que estaba haciendo?
- **Por qué importa:** perder un formulario largo porque la sesión venció es de las experiencias que más enojan.
- **Fuente:** [Nielsen Norman Group: 10 heurísticas de usabilidad](https://www.nngroup.com/articles/ten-usability-heuristics/)
