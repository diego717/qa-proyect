import type { Severity } from '../finding.ts';

/** What each kind of finding is, why it matters to the business or the user, and where the practice comes from. */
export type Explanation = { name: string; what: string; why: string; source: { label: string; url: string } };

export const EXPLANATIONS: Record<string, Explanation> = {
  'http-error': {
    name: 'Error HTTP',
    what: 'Una página o un recurso que la página necesita (un script, una hoja de estilos, una llamada a la API) respondió con un código de error. Los 5xx son fallas del servidor; los 4xx, pedidos que el servidor rechazó o no encontró.',
    why: 'El usuario ve una pantalla de error o una página a la que le falta algo: un botón que no responde, datos que no cargan. Un 5xx suele indicar un bug en el servidor que también puede afectar a otros usuarios.',
    source: { label: 'MDN: códigos de estado de respuesta HTTP', url: 'https://developer.mozilla.org/es/docs/Web/HTTP/Status' },
  },
  'broken-image': {
    name: 'Imagen rota',
    what: 'La página intenta mostrar una imagen que el servidor no entrega.',
    why: 'Se ve un ícono de imagen rota o un hueco en el diseño. Transmite descuido y, si la imagen explica algo (un gráfico, un producto), el usuario se queda sin esa información.',
    source: { label: 'MDN: el elemento <img>', url: 'https://developer.mozilla.org/es/docs/Web/HTML/Element/img' },
  },
  'js-error': {
    name: 'Error de JavaScript',
    what: 'Un error de código en el navegador que nadie capturó: el script se detuvo a mitad de camino.',
    why: 'Todo lo que ese script tenía que hacer después del error no ocurre: un formulario que no se envía, un menú que no abre, datos que no se muestran. El usuario no ve el error, solo que "no anda".',
    source: { label: 'MDN: referencia de errores de JavaScript', url: 'https://developer.mozilla.org/es/docs/Web/JavaScript/Reference/Errors' },
  },
  'console-error': {
    name: 'Error en la consola',
    what: 'El código de la página registró un error en la consola del navegador.',
    why: 'No siempre se ve en pantalla, pero indica que algo falló por dentro. Muchos errores de consola juntos dificultan encontrar los importantes cuando aparece un problema real.',
    source: { label: 'Chrome DevTools: la consola', url: 'https://developer.chrome.com/docs/devtools/console' },
  },
  'broken-link': {
    name: 'Link roto',
    what: 'Un link lleva a una página que no existe (404 o 410) o, en sitios externos, que da error.',
    why: 'El usuario hace click y termina en una página de error: pierde el hilo de lo que estaba haciendo y la confianza en el sitio. Los links rotos también perjudican el posicionamiento en buscadores.',
    source: { label: 'MDN: 404 Not Found', url: 'https://developer.mozilla.org/es/docs/Web/HTTP/Status/404' },
  },
  a11y: {
    name: 'Accesibilidad',
    what: 'La página no cumple un criterio de las pautas de accesibilidad WCAG 2.1 (niveles A y AA), detectado automáticamente con axe-core.',
    why: 'Las personas que usan lector de pantalla, teclado o ampliación no pueden usar esa parte de la página. Además, la accesibilidad es un requisito legal en cada vez más mercados. El detalle de cada hallazgo enlaza a la regla con la explicación y cómo arreglarla.',
    source: { label: 'W3C: WCAG 2.1', url: 'https://www.w3.org/TR/WCAG21/' },
  },
  'slow-page': {
    name: 'Página lenta',
    what: 'La página tardó más que el umbral "malo" de Core Web Vitals: el servidor demoró más de 1,8 s en empezar a responder (TTFB) o el contenido principal más de 4 s en aparecer (LCP). Es una medición de laboratorio, en una sola carga.',
    why: 'Cada segundo de espera aumenta la cantidad de usuarios que abandonan. Google usa estas mismas métricas para posicionar sitios en sus resultados.',
    source: { label: 'web.dev: Core Web Vitals', url: 'https://web.dev/articles/vitals' },
  },
  'form-static': {
    name: 'Formulario mal armado',
    what: 'Un campo del formulario no declara bien qué dato espera: un email sin type="email", o una contraseña sin el atributo autocomplete.',
    why: 'En el celular no aparece el teclado adecuado, el navegador no valida el dato y los gestores de contraseñas lo completan peor. Son detalles chicos que suman fricción en altas y logins.',
    source: { label: 'web.dev: buenas prácticas de formularios de login', url: 'https://web.dev/articles/sign-in-form-best-practices' },
  },
  'form-accepts-invalid': {
    name: 'El formulario acepta datos inválidos',
    what: 'Se envió el formulario con un dato claramente inválido (por ejemplo, un email sin @), salteando la validación del navegador como lo haría un script o un navegador viejo, y el servidor lo aceptó sin mostrar ningún error.',
    why: 'La validación del navegador se puede saltear fácilmente; si el servidor no valida, terminan datos basura en la base: emails a los que no se puede escribir, registros incompletos, errores más adelante en el proceso.',
    source: { label: 'OWASP: Input Validation Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html' },
  },
  exploration: {
    name: 'Observado explorando',
    what: 'Un problema que el agente encontró al recorrer un flujo de la app siguiendo un checklist, y que un revisor humano reprodujo y confirmó. El ítem del checklist que lo originó explica qué se miraba.',
    why: 'Son los problemas que ningún chequeo automático detecta: flujos confusos, mensajes que no ayudan, pasos que no hacen lo que prometen. Suelen ser los que más impactan en la experiencia del usuario.',
    source: { label: 'Nielsen Norman Group: 10 heurísticas de usabilidad', url: 'https://www.nngroup.com/articles/ten-usability-heuristics/' },
  },
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Crítico',
  serious: 'Grave',
  moderate: 'Moderado',
  minor: 'Menor',
};
