import type { Page } from '@playwright/test';
import { isLoginUrl } from '../../../e2e-template/template/e2e/lib/login-form.ts';
import { measured } from './page-events.ts';
import { isForbiddenUrl } from '../frontier.ts';
import type { Finding } from '../finding.ts';
import type { Target } from '../target.ts';

type FieldProblem = { key: string; kind: 'email-type' | 'password-autocomplete'; field: string };

/**
 * Static form checks (nothing is submitted). Missing labels are reported by axe, not here.
 * - an email field (by name, id or label) whose type is not "email": no email keyboard on phones, no browser validation;
 * - a password field without an autocomplete attribute: password managers fill it worse.
 */
export async function checkFormsStatic(page: Page): Promise<Finding[]> {
  const problems = await page.evaluate(() => {
    const out: { key: string; kind: 'email-type' | 'password-autocomplete'; field: string }[] = [];
    const inputs = Array.from(document.querySelectorAll('form input')) as HTMLInputElement[];
    for (const input of inputs) {
      const type = (input.getAttribute('type') ?? 'text').toLowerCase();
      if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'file', 'image', 'reset'].includes(type)) continue;
      const label = input.labels?.[0]?.textContent ?? '';
      const field = input.name || input.id || label || type;
      const formKey = input.form?.getAttribute('action') ?? '';
      if (/e-?mail|correo/i.test(`${input.name} ${input.id} ${label}`) && type !== 'email') {
        out.push({ key: `${formKey}|${field}|email-type`, kind: 'email-type', field });
      }
      if (type === 'password' && !input.hasAttribute('autocomplete')) {
        out.push({ key: `${formKey}|${field}|password-autocomplete`, kind: 'password-autocomplete', field });
      }
    }
    return out;
  });
  return problems.map((problem: FieldProblem) =>
    measured('form-static', page.url(), problem.key, {
      title: problem.kind === 'email-type' ? 'Campo de email sin type="email"' : 'Campo de contraseña sin atributo autocomplete',
      severity: 'minor',
      severitySource: 'HTML forms best practice',
      detail: `Campo "${problem.field}"`,
    }),
  );
}

/** Lets the form check open the navigation guard for exactly one submission and read what happened. */
export type SubmitControl = {
  begin(): void;
  /** Null until the guard has seen the submission's response. */
  status(): number | null;
  end(): { status: number | null; redirectedTo: string | null };
};

type FormCandidate = { index: number; action: string; method: string; submitText: string; hasEmail: boolean; hasRequired: boolean };

const INVALID_EMAIL = 'not-an-email';

async function waitUntil(condition: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
}

/**
 * Staging only. Sends each eligible form once with an invalid email (or an empty required field),
 * bypassing browser validation the way a script or an old browser would, and reports a form whose server
 * accepts it: status < 400 and no error shown ([role=alert] or [aria-invalid=true]).
 * Eligible: has an email or required field, is not the login form, and neither its action nor its button is never-click.
 */
export async function checkFormsInvalid(
  page: Page,
  target: Target,
  control: SubmitControl,
  tested: Set<string>,
  saveShot: (findingId: string, png: Buffer) => string,
): Promise<Finding[]> {
  if (target.mode !== 'staging') return [];
  const pageUrl = page.url();
  const loginUrl = target.loginPath ? new URL(target.loginPath, target.baseUrl).href : null;
  const candidates: FormCandidate[] = await page.evaluate(() =>
    Array.from(document.forms).map((form, index) => {
      const submit = form.querySelector('button[type=submit], button:not([type]), input[type=submit]') as HTMLElement | null;
      return {
        index,
        action: form.action,
        method: (form.getAttribute('method') ?? 'get').toUpperCase(),
        submitText: (submit?.textContent ?? (submit as HTMLInputElement | null)?.value ?? '').trim(),
        hasEmail: !!form.querySelector('input[type=email]'),
        hasRequired: !!form.querySelector('[required]'),
      };
    }),
  );

  const findings: Finding[] = [];
  let dirty = false;
  for (const form of candidates) {
    const key = `${pageUrl}|${form.action}`;
    if (!form.hasEmail && !form.hasRequired) continue;
    if (tested.has(key)) continue;
    if (new URL(form.action).origin !== new URL(target.baseUrl).origin) continue;
    if (loginUrl && isLoginUrl(form.action, loginUrl)) continue;
    if (isForbiddenUrl(form.action, form.submitText, target.neverClick)) continue;
    tested.add(key);

    if (dirty) await page.goto(pageUrl, { waitUntil: 'load' }).catch(() => null);
    dirty = true;
    control.begin();
    let outcome: { status: number | null; redirectedTo: string | null };
    try {
      await page.evaluate(
        ({ index, invalidEmail }) => {
          const element = document.forms[index];
          const hasEmail = !!element.querySelector('input[type=email]');
          for (const input of Array.from(element.querySelectorAll('input, textarea')) as HTMLInputElement[]) {
            if (input.type === 'email') input.value = invalidEmail;
            else if (input.required && !input.value && hasEmail) input.value = `qa-test-${Date.now()}`; // only the email is wrong
          }
          element.noValidate = true;
          element.requestSubmit();
        },
        { index: form.index, invalidEmail: INVALID_EMAIL },
      );
      await waitUntil(() => control.status() !== null, 15_000);
    } finally {
      outcome = control.end();
    }
    if (outcome.status === null) continue; // no navigation (JavaScript form) or blocked by the guard
    if (outcome.redirectedTo) await page.goto(outcome.redirectedTo, { waitUntil: 'load' }).catch(() => null);
    else await page.waitForLoadState('load').catch(() => {});

    const showsError = await page
      .evaluate(() => !!document.querySelector('[role=alert], [aria-invalid="true"]'))
      .catch(() => false);
    const accepted = outcome.status < 400 && (outcome.redirectedTo !== null || !showsError);
    if (!accepted) continue;

    const finding = measured('form-accepts-invalid', pageUrl, form.action, {
      title: 'El formulario acepta datos inválidos',
      severity: 'serious',
      severitySource: 'server accepted invalid input',
      detail: `${form.method} ${form.action} → HTTP ${outcome.status}${outcome.redirectedTo ? `, redirige a ${outcome.redirectedTo}` : ''}`,
      steps: [
        `Abrir ${pageUrl} con la sesión del usuario de prueba.`,
        form.hasEmail
          ? `Completar el campo de email con "${INVALID_EMAIL}".`
          : 'Dejar vacío un campo obligatorio.',
        'Enviar el formulario sin la validación del navegador (como lo haría un script o un navegador viejo).',
        `El servidor responde HTTP ${outcome.status} y no muestra ningún mensaje de error.`,
      ],
    });
    const shot = await page.screenshot({ fullPage: true }).catch(() => null);
    if (shot) finding.evidence.screenshot = saveShot(finding.id, shot);
    findings.push(finding);
  }
  return findings;
}
