import { lstatSync, readFileSync, realpathSync } from 'node:fs';
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
