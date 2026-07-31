/** Resolve a path under Vite `public/` for runtime fetch and asset URLs. */
export function publicUrl(path: string): string {
  const normalized = path.startsWith('/') ? path.slice(1) : path
  const base = import.meta.env.BASE_URL || '/'
  return `${base}${normalized}`
}
