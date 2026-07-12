import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useGetBranding, getGetBrandingQueryKey, type Branding, type BrandingColors } from "@workspace/api-client-react";
import { parseOklch, formatOklch, deriveRamp, foregroundFor, darkVariant, type Oklch } from "@/lib/oklch";
import { DEFAULT_BRANDING } from "./default-branding";

const ThemeContext = createContext<{ branding: Branding }>({ branding: DEFAULT_BRANDING });

export function useBranding() {
  return useContext(ThemeContext);
}

/** URL for an uploaded logo storage key (served by the public branding API). */
export function logoUrl(key: string | null | undefined): string | null {
  return key ? `/api/branding/logo/${key}` : null;
}

const STYLE_EL_ID = "brand-overrides";

/**
 * CSS custom properties for one mode, derived from the six brand colors.
 * Mirrors the token mapping in index.css (chart policy, sidebar policy,
 * interaction ramps) — see DESIGN.md.
 */
function cssVarsFor(colors: BrandingColors, mode: "light" | "dark"): string {
  const parse = (s: string): Oklch | null => parseOklch(s);
  const base = {
    primary: parse(colors.primary),
    secondary: parse(colors.secondary),
    accent: parse(colors.accent),
    success: parse(colors.success),
    warning: parse(colors.warning),
    error: parse(colors.error),
  };
  const lines: string[] = [];
  const emit = (name: string, value: Oklch | null) => {
    if (value) lines.push(`--${name}: ${formatOklch(value)};`);
  };
  const forMode = (c: Oklch | null): Oklch | null => (c ? (mode === "dark" ? darkVariant(c) : c) : null);

  const primary = forMode(base.primary);
  const secondary = forMode(base.secondary);
  const accent = forMode(base.accent);
  const success = forMode(base.success);
  const warning = forMode(base.warning);
  const error = forMode(base.error);

  emit("primary", primary);
  emit("primary-foreground", primary && foregroundFor(primary));
  emit("ring", primary);
  emit("sidebar-primary", primary);
  emit("sidebar-primary-foreground", primary && foregroundFor(primary));
  emit("sidebar-ring", primary);
  emit("secondary", secondary);
  emit("secondary-foreground", secondary && foregroundFor(secondary));
  emit("accent", accent);
  emit("accent-foreground", accent && foregroundFor(accent));
  emit("sidebar-accent", accent);
  emit("sidebar-accent-foreground", accent && foregroundFor(accent));
  emit("success", success);
  emit("warning", warning);
  emit("destructive", error);
  emit("destructive-foreground", error && foregroundFor(error));
  // Chart policy: chart-1..5 = primary, secondary, accent, success, warning
  emit("chart-1", primary);
  emit("chart-2", secondary);
  emit("chart-3", accent);
  emit("chart-4", success);
  emit("chart-5", warning);
  // Interaction ramps (same set as the static fallbacks in index.css)
  if (primary) {
    const ramp = deriveRamp(primary, mode);
    emit("primary-hover", ramp.hover);
    emit("primary-active", ramp.active);
    emit("primary-subtle", ramp.subtle);
  }
  if (accent) {
    const ramp = deriveRamp(accent, mode);
    emit("accent-hover", ramp.hover);
    emit("accent-subtle", ramp.subtle);
  }
  if (error) {
    emit("destructive-hover", deriveRamp(error, mode).hover);
  }
  return lines.join("\n  ");
}

function colorsEqualDefault(colors: BrandingColors): boolean {
  return (Object.keys(DEFAULT_BRANDING.colors) as (keyof BrandingColors)[]).every(
    (k) => colors[k] === DEFAULT_BRANDING.colors[k],
  );
}

function applyBranding(branding: Branding) {
  // Colors: injected as a <style> with both mode scopes so the dark-mode
  // block keeps working (inline styles on <html> would override it). When the
  // brand colors ARE the default identity, inject nothing — the hand-designed
  // palette in index.css (including its designed dark variant) stays
  // authoritative; custom brands get an algorithmically derived dark mode.
  const existing = document.getElementById(STYLE_EL_ID);
  if (colorsEqualDefault(branding.colors)) {
    existing?.remove();
  } else {
    const el = existing ?? document.createElement("style");
    el.id = STYLE_EL_ID;
    el.textContent = `:root {\n  ${cssVarsFor(branding.colors, "light")}\n}\n[data-theme="dark"] {\n  ${cssVarsFor(branding.colors, "dark")}\n}`;
    if (!existing) document.head.appendChild(el);
  }

  document.title = `${branding.name} Investor Portal`;

  const faviconHref = logoUrl(branding.logos?.favicon);
  if (faviconHref) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = faviconHref;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data } = useGetBranding({ query: { queryKey: getGetBrandingQueryKey(), staleTime: 60_000 } });
  const branding = data ?? DEFAULT_BRANDING;
  useEffect(() => {
    applyBranding(branding);
  }, [branding]);
  const ctx = useMemo(() => ({ branding }), [branding]);
  return <ThemeContext.Provider value={ctx}>{children}</ThemeContext.Provider>;
}
