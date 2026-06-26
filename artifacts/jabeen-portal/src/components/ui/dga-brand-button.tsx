import { DgaButton } from "platformscode-new-react";
import type { ComponentProps, CSSProperties } from "react";

/**
 * JABEEN primary CTA — the DGA `primary-brand` (gold) button with an accessible
 * DARK label.
 *
 * Why this wrapper exists: the DGA button paints its label with
 * `var(--text-oncolor-primary)` (white), which is 3.23:1 on the JABEEN gold fill
 * and FAILS WCAG AA. Verified against the rendered Shadow DOM (core@0.0.50):
 *   - there is NO `::part(label)` (the label is `<span class="dga-btn-label">`);
 *   - the host exposes NO `variant` attribute (variant is an internal shadow
 *     class), so attribute selectors like `dga-button[variant="primary-brand"]`
 *     never match.
 * The only working hook is the custom property `--text-oncolor-primary`, which
 * pierces the shadow boundary. We set it via the host's inline `style` rather
 * than a marker class: `@lit/react` maps `className` onto the `class` attribute
 * and React then manages it, which would clobber Stencil's imperatively-added
 * `hydrated` class on re-render. `style` is forwarded untouched, so it is safe.
 *
 * Dark label `#0c111b` on gold `#b38916` measures ~5.4:1 — PASS in both themes
 * (the gold fill is theme-independent). Do NOT override `--text-oncolor-primary`
 * globally: primary-neutral, des-primary and the on-color variants need white.
 */
const DARK_LABEL_ON_GOLD = {
  "--text-oncolor-primary": "var(--colors-neutral-950)",
} as CSSProperties;

export function DgaBrandButton({
  style,
  ...props
}: ComponentProps<typeof DgaButton>) {
  return (
    <DgaButton
      variant="primary-brand"
      {...props}
      style={{ ...DARK_LABEL_ON_GOLD, ...style }}
    />
  );
}
