export interface Oklch {
  l: number;
  c: number;
  h: number;
}

export function parseOklch(s: string): Oklch | null {
  const m = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*[\d.%]+\s*)?\)$/.exec(s.trim());
  if (!m) return null;
  const l = m[1].endsWith("%") ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
  return { l, c: parseFloat(m[2]), h: parseFloat(m[3]) };
}

export function formatOklch({ l, c, h }: Oklch): string {
  const r = (n: number, p: number) => Math.round(n * 10 ** p) / 10 ** p;
  return `oklch(${r(l, 4)} ${r(c, 4)} ${r(h, 2)})`;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Interaction ramp for a base fill color. Mirrors the static fallbacks in
 * index.css (hover L−0.05, active L−0.09, subtle = near-bg tint of the hue)
 * and DESIGN.md's derivation rules — keep the three in sync.
 */
export function deriveRamp(base: Oklch, mode: "light" | "dark" = "light") {
  return {
    hover: { ...base, l: clamp01(base.l - 0.05) },
    active: { ...base, l: clamp01(base.l - 0.09) },
    subtle: { l: mode === "light" ? 0.95 : 0.22, c: Math.min(base.c, 0.03), h: base.h },
    foreground: foregroundFor(base),
  };
}

/** Near-black ink on light fills, near-white on dark fills. */
export function foregroundFor(base: Oklch): Oklch {
  return base.l > 0.62 ? { l: 0.16, c: Math.min(base.c, 0.02), h: base.h } : { l: 0.985, c: 0, h: base.h };
}

/**
 * Algorithmic dark-mode variant of a light-mode brand fill: flip lightness
 * around the DESIGN.md pivot (light primary 0.46 → dark 0.82≈0.83) and boost
 * chroma slightly so fills stay legible on the near-black ground. Used only
 * for custom tenant brands — the default identity ships a hand-designed dark
 * palette in index.css that this function never overrides.
 */
export function darkVariant(base: Oklch): Oklch {
  return {
    l: Math.min(0.88, Math.max(0.5, 1.28 - base.l)),
    c: Math.min(base.c * 1.25, 0.15),
    h: base.h,
  };
}

// ---- hex ⇄ oklch (sRGB, Ottosson OKLab matrices) ---------------------------

function srgbToLinear(u: number): number {
  return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
}
function linearToSrgb(u: number): number {
  return u <= 0.0031308 ? 12.92 * u : 1.055 * u ** (1 / 2.4) - 0.055;
}

export function hexToOklch(hex: string): Oklch | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = srgbToLinear(((n >> 16) & 255) / 255);
  const g = srgbToLinear(((n >> 8) & 255) / 255);
  const b = srgbToLinear((n & 255) / 255);
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const b2 = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.sqrt(a * a + b2 * b2);
  let h = (Math.atan2(b2, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

export function oklchToHex({ l, c, h }: Oklch): string {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b2 = c * Math.sin(hr);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b2) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b2) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b2) ** 3;
  const r = linearToSrgb(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_);
  const g = linearToSrgb(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_);
  const b = linearToSrgb(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_);
  const to255 = (u: number) => Math.max(0, Math.min(255, Math.round(u * 255)));
  return "#" + [r, g, b].map((u) => to255(u).toString(16).padStart(2, "0")).join("");
}
