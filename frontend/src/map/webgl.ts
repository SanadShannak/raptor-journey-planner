/**
 * Whether this browser can render a map at all.
 *
 * The maps here are vector: the browser is handed geometry and a stylesheet
 * and draws the roads itself, on the GPU. That is not a detail of how they are
 * implemented, it *is* what they are — there is no software path to fall back
 * to, and MapLibre says so plainly by refusing to construct without WebGL2.
 *
 * Asking first, rather than finding out by catching. A map that fails to build
 * takes the page with it: the error escapes the effect that created it, React
 * unwinds, and what a reader gets is a blank screen where the itinerary should
 * be — a journey they could have read as text, lost to a picture of it they
 * were never going to see.
 *
 * The cases this is really for are not old browsers. The declared baseline —
 * Chrome 111, Firefox 113, Safari 15.4 — all ship WebGL2. What actually turns
 * it off is a hardened or privacy-focused configuration, a blocklisted GPU
 * driver, a remote session with no accelerated context, or a machine where it
 * has simply been disabled. Those are ordinary visitors on current software,
 * and the page has to work for them.
 */

/**
 * Asked once and remembered.
 *
 * The answer cannot change while the document lives, and the question is not
 * free: it allocates a context, which on some drivers is slow enough to be
 * worth not repeating on every render.
 */
let answer: boolean | null = null;

export function hasWebGl(): boolean {
  if (answer !== null) return answer;
  if (typeof document === 'undefined') return false;

  try {
    const canvas = document.createElement('canvas');
    /*
     * WebGL2 specifically, because that is what MapLibre requires — testing
     * for WebGL1 would report support the map cannot use, which is worse than
     * not testing at all.
     */
    const context = canvas.getContext('webgl2');
    answer = context !== null;

    /*
     * Handed back rather than left for the collector. A context is a real
     * device resource and browsers cap how many may exist at once; a probe
     * that kept one would spend part of that budget saying "yes, you have a
     * budget".
     */
    if (context !== null) {
      context.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    // Some configurations throw rather than return null. Same answer.
    answer = false;
  }

  return answer;
}

/** Lets a test put the answer back. */
export function forgetWebGlSupport(): void {
  answer = null;
}
