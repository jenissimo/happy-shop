/**
 * At most one Pixi `Application` per canvas, ever.
 *
 * `Application.init` is async and a mount can be torn down before it resolves —
 * React StrictMode does exactly that on every mount in development, and any
 * remount can do it in production. The backend's `destroy()` then finds no app
 * to dispose, and the orphaned Application goes on to finish initialising
 * against the *same* `<canvas>`, which hands out the *same* WebGL context.
 * Whichever init lands last reconfigures that context, and when it is the
 * orphan the live backend spends the rest of the session rendering into state
 * that never reaches the screen: an empty viewport with an intact scene graph,
 * a valid drawing buffer, a correct `extract`, and no context loss to show for
 * it.
 *
 * Disposing the loser instead is not an option: Pixi's `GlContextSystem.destroy`
 * calls `WEBGL_lose_context.loseContext()`, so the canvas would hand the next
 * Application the same, now permanently lost, context.
 *
 * That is also why `releaseApplication` does not make a canvas reusable in
 * practice: it clears the bookkeeping, but the element itself is spent. A host
 * that wants a genuinely fresh Application must mount a fresh `<canvas>` (see
 * `ViewportHost`'s generation key), which this registry then treats as the new
 * identity it is.
 *
 * So a second caller reuses the first Application rather than building one. The
 * stage stays untouched until a backend installs itself, which makes handing it
 * over safe, and the context is configured exactly once.
 */
const pending = new WeakMap<object, Promise<unknown>>()

/**
 * The Application for `canvas`, creating it only if this is the first caller.
 * Concurrent callers share one `create()`.
 */
export function acquireApplication<T>(
  canvas: object,
  create: () => Promise<T>,
): Promise<T> {
  const existing = pending.get(canvas)
  if (existing) return existing as Promise<T>
  const created = create()
  pending.set(canvas, created)
  // A failed init must not poison the canvas against a later retry.
  void created.catch(() => {
    if (pending.get(canvas) === created) pending.delete(canvas)
  })
  return created
}

/** Forget the Application for `canvas`; the next acquire builds a fresh one. */
export function releaseApplication(canvas: object): void {
  pending.delete(canvas)
}
