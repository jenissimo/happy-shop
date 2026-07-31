import { isAbsolute, normalize, relative, resolve, sep } from 'node:path'

/**
 * Resolve `candidate` under `root` and reject `..`, absolute escapes, and
 * symlink-style path traversal (SPEC §13.4). Bridge/server only.
 */
export function resolveUnderRoot(root: string, candidate: string): string {
  if (!candidate || candidate.includes('\0')) {
    throw new Error('invalid path')
  }
  if (isAbsolute(candidate)) {
    throw new Error('absolute paths are not allowed')
  }
  const normalizedRoot = normalize(resolve(root))
  const resolved = normalize(resolve(normalizedRoot, candidate))
  const rel = relative(normalizedRoot, resolved)
  if (rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) {
    throw new Error('path escapes project root')
  }
  if (rel.split(/[/\\]/).includes('..')) {
    throw new Error('path escapes project root')
  }
  if (!resolved.startsWith(normalizedRoot + sep) && resolved !== normalizedRoot) {
    throw new Error('path escapes project root')
  }
  return resolved
}

export function assertSafeAssetId(id: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new Error('invalid asset id')
  }
  return id
}
