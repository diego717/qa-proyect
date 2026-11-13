/**
 * Links the explorer never visits, not even in staging: a GET can still log out, delete,
 * pay or send something in a badly built app. Matched against the link text and its path.
 */
const FIXED = [
  /log ?out|sign ?out|cerrar sesi[oó]n|\bsalir\b/i,
  /delete|remove|destroy|eliminar|borrar|quitar/i,
  /cancel|cancelar|unsubscribe|darse de baja|desuscribir/i,
  /\bpay\b|purchase|\bbuy\b|checkout\/confirm|pagar|comprar/i,
  /confirm|confirmar/i,
  /\bsend\b|enviar/i,
  /\breset\b|restablecer/i,
];

export function isForbidden(link: { text: string; href: string }, extra: string[] = []): boolean {
  let pathPart = link.href;
  try {
    const url = new URL(link.href, 'http://placeholder');
    pathPart = `${url.pathname}${url.search}`;
  } catch {
    // Unparseable href: match against it as is.
  }
  const patterns = [...FIXED, ...extra.map((source) => new RegExp(source, 'i'))];
  return patterns.some((pattern) => pattern.test(link.text) || pattern.test(pathPart));
}
