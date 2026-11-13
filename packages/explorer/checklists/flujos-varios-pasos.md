# Flujos de varios pasos (checkout, reservas, asistentes)

### 1. Se sabe en qué paso estoy y cuántos faltan
- **Qué mirar:** recorrer el flujo y ver si hay un indicador de pasos que se actualiza.
- **Por qué importa:** sin saber cuánto falta, el usuario abandona flujos largos.
- **Fuente:** [Nielsen Norman Group: Visibility of System Status](https://www.nngroup.com/articles/visibility-system-status/)

### 2. Volver un paso no pierde lo cargado
- **Qué mirar:** completar dos pasos, volver al anterior (con el botón de la app y con el "atrás" del navegador) y ver si los datos siguen ahí.
- **Por qué importa:** corregir un dato del paso anterior es muy común; perder todo por hacerlo es motivo de abandono.
- **Fuente:** [Nielsen Norman Group: 10 heurísticas de usabilidad](https://www.nngroup.com/articles/ten-usability-heuristics/)

### 3. Antes de confirmar se ve un resumen de todo
- **Qué mirar:** el último paso antes de confirmar. ¿Muestra todo lo que se va a confirmar (productos, montos, fechas, dirección) y permite editarlo?
- **Por qué importa:** prevenir el error antes de que pase es más barato que deshacerlo: un pedido equivocado cuesta soporte y devoluciones.
- **Fuente:** [WCAG 2.1: 3.3.4 Prevención de errores](https://www.w3.org/WAI/WCAG21/Understanding/error-prevention-legal-financial-data)

### 4. En solo lectura, se llega al último paso sin confirmar
- **Qué mirar:** en modo solo lectura, recorrer hasta la pantalla de confirmación y frenar ahí. Anotar en el resumen qué parte del flujo quedó sin verificar.
- **Por qué importa:** confirmar en producción crea pedidos o cobros reales. Dejar escrito qué no se verificó evita que el informe sugiera que se probó todo.
- **Fuente:** [Snagly: flow-runner (principio "mirar sin confirmar")](https://github.com/softwaretestingtrends/snagly)

### 5. Un error en un paso explica cómo seguir
- **Qué mirar:** solo en staging: provocar un error en un paso intermedio (por ejemplo, un código postal inválido). ¿El mensaje dice cómo corregirlo, sin volver al inicio?
- **Por qué importa:** tener que reiniciar un flujo largo por un error es la forma más rápida de perder al usuario.
- **Fuente:** [WCAG 2.1: 3.3.3 Sugerencias ante errores](https://www.w3.org/WAI/WCAG21/Understanding/error-suggestion)

### 6. Dirección y pago usan autocompletado
- **Qué mirar:** en DevTools, que los campos de dirección y tarjeta tengan atributos `autocomplete` (`street-address`, `postal-code`, `cc-number`...).
- **Por qué importa:** el autocompletado del navegador ahorra minutos de escritura en el celular, justo en el paso donde más gente abandona.
- **Fuente:** [web.dev: formularios de pago y dirección](https://web.dev/articles/payment-and-address-form-best-practices)
