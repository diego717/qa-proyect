# Resumen de la auditoría: Demo app (práctica)

Recorrimos la aplicación con un navegador real, con la sesión de un usuario de prueba, en modo **staging**: se completaron formularios con datos marcados como de prueba (`qa-test-2026-11-14`). Se sumaron estos recorridos al escaneo automático del sitio.

## Qué exploramos

- Alta de ítems en /items: alta normal, campo vacío, solo espacios, nombres con tilde, ñ, apóstrofe y símbolos, nombres muy largos, doble click en "Add", envío con Enter y nombre repetido.
- Los tres formularios de suscripción de /lab (/lab/form, /lab/form-ok y /lab/form-back): email válido con "+", campo vacío, emails mal escritos, corrección después de un error y botón "atrás" del navegador.

## Los problemas de mayor impacto

- **Una página del sitio devuelve un error del servidor** (/lab/server-error, HTTP 500): quien llega ahí no puede seguir. Detectado por el escaneo automático.
- **Un formulario no se puede usar con lector de pantalla** (/lab/unlabeled): sus campos no tienen etiqueta, así que una persona ciega no sabe qué completar. Detectado por el escaneo automático.
- **El formulario de suscripción de /lab/form acepta emails inválidos** y responde "Saved": se guardan contactos a los que nunca va a llegar un correo. Detectado por el escaneo automático y confirmado en la exploración.
- **Un error de JavaScript sin capturar en /lab/js-error**: partes de esa página pueden no funcionar. Detectado por el escaneo automático.
- **Un nombre de ítem largo rompe el diseño de la lista** (/items): desde que se guarda, toda la página queda casi el doble de ancha que la pantalla y hay que moverse de costado para leerla; en celular sería peor. Observado en la exploración.

## Otros detalles observados

- En /items, el campo "New item" es obligatorio pero no se indica hasta enviarlo vacío; el mensaje dice "Name is required" aunque el campo se llama "New item".
- En /lab/form-back y /lab/form-ok, cuando el email es inválido el campo se vacía y el mensaje solo dice "Invalid email", sin explicar qué corregir.

## Observaciones sin ítem de checklist (para que Diego decida)

- En /items se puede cargar dos veces un ítem con el mismo nombre sin ningún aviso.
- El botón "Add" no muestra que está procesando. Con el servidor local no se logró duplicar un ítem con doble click, pero con una red lenta conviene volver a probarlo.
- En los formularios de /lab, la confirmación "Saved" es la respuesta directa al envío: si el usuario recarga la página, el navegador ofrece reenviar el formulario y se vuelve a suscribir.

## Lo que salió bien

- Los nombres con tilde, ñ, apóstrofe y símbolos (`Ñandú O'Brien <b>x</b> & café`) se guardan y se muestran tal cual, sin romper la página.
- Los emails con "+" se aceptan en los tres formularios.
- El campo vacío o con solo espacios se rechaza en /items con un mensaje en texto.

## Qué quedó sin verificar

- Comportamiento con red lenta o sin conexión: el recorrido se hizo contra un servidor local, sin simular fallas de red.
- Uso en celular: no se recorrió con tamaño de pantalla de teléfono.
- No se probaron otros flujos fuera del alta de ítems y los formularios de /lab, como cerrar sesión, porque no estaban en el pedido.
