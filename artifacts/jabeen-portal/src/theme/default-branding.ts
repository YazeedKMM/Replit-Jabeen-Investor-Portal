import type { Branding } from "@workspace/api-client-react";

/**
 * Compiled-in fallback branding. MUST stay byte-identical to the server's
 * DEFAULT_BRANDING (artifacts/api-server/src/routes/branding.ts) and to the
 * DESIGN.md "Palette — light" table — all three describe the same identity.
 * When the active branding equals this default, ThemeProvider injects nothing
 * and the hand-designed palette in index.css (light AND dark) applies as-is.
 */
export const DEFAULT_BRANDING: Branding = {
  name: "JABEEN",
  colors: {
    primary: "oklch(0.46 0.09 118)",
    secondary: "oklch(0.40 0.06 195)",
    accent: "oklch(0.34 0.09 45)",
    success: "oklch(0.53 0.12 155)",
    warning: "oklch(0.56 0.11 75)",
    error: "oklch(0.53 0.19 27)",
  },
  logos: { light: null, dark: null, favicon: null },
};
