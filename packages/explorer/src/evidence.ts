import { lstatSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');

/**
 * Reads an audit's evidence. Paths may come from the model (observed.json), and the model can write
 * files, so only a relative path to a regular .png file (no symlink) whose real location is directly
 * inside <auditDir>/evidence, with a PNG signature, is read. Anything else returns null.
 */
export function evidenceReader(auditDir: string): (relativePath: string) => Buffer | null {
  return (relativePath) => {
    if (typeof relativePath !== 'string' || path.isAbsolute(relativePath) || !relativePath.toLowerCase().endsWith('.png')) return null;
    try {
      const evidenceDir = realpathSync(path.resolve(auditDir, 'evidence'));
      const resolved = path.resolve(auditDir, relativePath);
      if (!lstatSync(resolved).isFile()) return null; // lstat: a symlink is not a regular file
      if (path.dirname(realpathSync(resolved)) !== evidenceDir) return null;
      const content = readFileSync(resolved);
      return content.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) ? content : null;
    } catch {
      return null;
    }
  };
}

/**
 * Resolves a path to write inside an audit folder, creating its parent folders. The model can write files
 * in the audit folder, so nothing is written through a symlink or junction: every existing component below
 * the audit folder (folders and the file itself) must be a real file or folder. Throws otherwise.
 */
export function safeOutputPath(auditDir: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) throw new Error(`refusing to write ${relativePath}: path must be relative (outside the audit folder)`);
  const base = path.resolve(auditDir);
  const target = path.resolve(base, relativePath);
  if (target !== base && !target.startsWith(base + path.sep)) throw new Error(`refusing to write outside the audit folder: ${relativePath}`);
  let current = base;
  for (const part of path.relative(base, target).split(path.sep)) {
    current = path.join(current, part);
    let stat;
    try {
      stat = lstatSync(current);
    } catch {
      break; // does not exist yet: nothing below it can be a link
    }
    if (stat.isSymbolicLink()) throw new Error(`refusing to write through a symlink: ${path.relative(base, current)}`);
  }
  mkdirSync(path.dirname(target), { recursive: true });
  return target;
}
