import type { Page } from '@playwright/test';
import { measured } from './page-events.ts';
import type { Finding } from '../finding.ts';

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
