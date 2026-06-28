/**
 * Runtime guard for the DGA "Platforms Code" global CSS reset.
 *
 * The DGA Stencil component runtime injects a global, UNLAYERED reset
 * (`@platformscode/core`'s Eric-Meyer-style reset: `html{font-size:62.5%}`,
 * `article,…,header,…{display:block}`, `*{margin:0;padding:0}`) directly into
 * <head> the first time a DGA component mounts. Because it is unlayered it beats
 * Tailwind v4's LAYERED utilities (unlayered ranks above any @layer), which
 * collapses the app header's `flex` to `block` and zeroes element spacing on
 * every page that renders a DGA component such as `DgaLinearProgressBar`.
 *
 * The build-time copies of this CSS are already wrapped into `@layer dga` by the
 * `dgaCssInLayer` Vite plugin, but that plugin only sees Vite-imported modules —
 * it cannot touch what the Stencil runtime injects. This guard is the runtime
 * analog: it watches <head>, finds those runtime-injected reset stylesheets, and
 * rewraps their contents in `@layer dga` so they rank BELOW Tailwind, exactly
 * like the build-time copies. DGA components use Shadow DOM, so their own visuals
 * are unaffected by this demotion.
 */

const MARK = "data-dga-layered";

// Signatures unique to the DGA/Meyer global reset; avoids touching unrelated styles.
const RESET_SIGNATURE = /font-size\s*:\s*62\.5%|applet\s*,\s*object\s*,\s*iframe/i;

function rewrap(style: HTMLStyleElement): void {
  if (style.hasAttribute(MARK)) return;
  if (style.hasAttribute("data-vite-dev-id")) return; // build-time import: already layered by the Vite plugin
  const css = style.textContent ?? "";
  if (!css) return; // injected empty, content filled later — caught on the next mutation
  if (/^\s*@layer\b/i.test(css)) {
    style.setAttribute(MARK, "skip"); // already layered
    return;
  }
  if (!RESET_SIGNATURE.test(css)) return; // not the DGA reset
  style.setAttribute(MARK, "1");
  style.textContent = `@layer dga {\n${css}\n}`;
}

function sweep(): void {
  document.querySelectorAll<HTMLStyleElement>("style:not([" + MARK + "])").forEach(rewrap);
}

/** Install before React renders so the observer is watching before DGA mounts. */
export function installDgaLayerGuard(): void {
  if (typeof document === "undefined") return;
  sweep(); // catch anything already present
  const observer = new MutationObserver(() => sweep());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true, // styles are sometimes appended empty, then filled
  });
}
