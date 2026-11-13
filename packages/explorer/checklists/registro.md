# Alta y registro

### 1. Los requisitos de la contraseña se ven antes de fallar
- **Qué mirar:** en el formulario de alta, ¿dice qué largo y qué caracteres pide la contraseña antes de enviarlo, o recién lo dice al rechazarla?
- **Por qué importa:** descubrir las reglas por prueba y error es frustrante y causa abandonos justo en el alta.
- **Fuente:** [Nielsen Norman Group: Password Creation](https://www.nngroup.com/articles/password-creation/)

### 2. El formulario pide solo lo necesario
- **Qué mirar:** contar los campos obligatorios. ¿Cada uno hace falta para crear la cuenta, o se podría pedir después?
- **Por qué importa:** cada campo de más reduce la cantidad de gente que termina el alta.
- **Fuente:** [web.dev: buenas prácticas de formularios de alta](https://web.dev/articles/sign-up-form-best-practices)

### 3. Un email ya registrado tiene una salida clara
- **Qué mirar:** solo en staging: intentar registrar el email del usuario de prueba (que ya existe). ¿Ofrece iniciar sesión o recuperar la contraseña?
- **Por qué importa:** mucha gente olvida que ya tiene cuenta. Si el mensaje no ofrece salida, se va.
- **Fuente:** [OWASP: Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

### 4. Los errores aparecen junto al campo y dicen cómo corregirlos
- **Qué mirar:** solo en staging: enviar el alta con datos incompletos. ¿Cada error aparece junto a su campo, en lenguaje claro, y se conserva lo ya escrito?
- **Por qué importa:** un error genérico arriba del formulario obliga a adivinar qué campo está mal.
- **Fuente:** [WCAG 2.1: 3.3.3 Sugerencias ante errores](https://www.w3.org/WAI/WCAG21/Understanding/error-suggestion)

### 5. Se puede completar cómodamente en el celular
- **Qué mirar:** abrir el alta con viewport de celular (390 px). ¿Aparece el teclado correcto en cada campo (email, teléfono, números) y se ve el botón sin hacer zoom?
- **Por qué importa:** en muchos productos la mayoría de las altas llegan desde el celular.
- **Fuente:** [web.dev: buenas prácticas de formularios de alta](https://web.dev/articles/sign-up-form-best-practices)
