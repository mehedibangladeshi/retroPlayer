/** Move dirs[from] into gap `to` (an insertion index in the original list, 0..length); returns a new array. */
export function moveDir(dirs: string[], from: number, to: number): string[] {
  const out = [...dirs]
  if (!dirs.length) return out
  const f = Math.min(Math.max(from, 0), dirs.length - 1)
  const t = Math.min(Math.max(to, 0), dirs.length)
  const [moved] = out.splice(f, 1)
  out.splice(t > f ? t - 1 : t, 0, moved)
  return out
}
