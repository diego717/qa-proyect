# Formularios

### 1. Cada campo tiene un label visible
- **Qué mirar:** que cada campo tenga un texto visible que diga qué va ahí, y no solo un placeholder que desaparece al escribir.
- **Por qué importa:** con el placeholder como única pista, el usuario olvida qué era el campo apenas empieza a escribir. Los lectores de pantalla tampoco lo anuncian bien.
- **Fuente:** [WCAG 2.1: 3.3.2 Etiquetas o instrucciones](https://www.w3.org/WAI/WCAG21/Understanding/labels-or-instructions)

### 2. Los obligatorios están marcados antes de enviar
- **Qué mirar:** ¿se distingue qué campos son obligatorios antes de enviar el formulario?
- **Por qué importa:** descubrirlo recién al enviar obliga a volver a revisar todo el formulario.
- **Fuente:** [Nielsen Norman Group: Marking Required Fields in Forms](https://www.nngroup.com/articles/required-fields/)

### 3. Los errores se identifican en texto, junto al campo
- **Qué mirar:** solo en staging: enviar con un dato inválido. ¿El error dice qué campo está mal y cómo corregirlo, en texto (no solo en rojo)?
- **Por qué importa:** si el error solo se indica con color, las personas daltónicas o con lector de pantalla no lo perciben.
- **Fuente:** [WCAG 2.1: 3.3.1 Identificación de errores](https://www.w3.org/WAI/WCAG21/Understanding/error-identification)

### 4. El envío da feedback y no se puede duplicar
- **Qué mirar:** solo en staging: al enviar, ¿el botón muestra que está procesando? Tocarlo dos veces rápido: ¿crea dos registros?
- **Por qué importa:** sin feedback, el usuario vuelve a tocar el botón. Un doble envío duplica pedidos, pagos o mensajes.
- **Fuente:** [Nielsen Norman Group: Visibility of System Status](https://www.nngroup.com/articles/visibility-system-status/)

### 5. Al fallar, no se pierde lo ya escrito
- **Qué mirar:** solo en staging: provocar un error de validación. ¿Los demás campos conservan lo que se había escrito?
- **Por qué importa:** tener que volver a escribir todo por un solo campo mal es una de las principales causas de abandono.
- **Fuente:** [Nielsen Norman Group: Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/)

### 6. Acepta datos reales poco comunes
- **Qué mirar:** solo en staging, con datos marcados como de prueba: nombres con tilde, ñ y apóstrofe (Ñandú O'Brien), textos largos, emails con "+" (qa+prueba@ejemplo.com).
- **Por qué importa:** rechazar o romper un nombre real es excluir a clientes reales. Un "+" en el email es muy común entre usuarios técnicos.
- **Fuente:** [OWASP: Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
