// Integration tests for the branding API on the JABEEN Investor Portal.
// Requires a freshly seeded DB (docker compose down -v && up -d) — MFA enrollment mutates admin/PM accounts.
// Hits the API directly on :8080. Node 24 (global fetch/FormData/Blob/crypto).
import crypto from "node:crypto";

const BASE = "http://localhost:8080/api";
const ts = Date.now();

// ---- result tracking -------------------------------------------------------
const results = [];
let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (ok) { pass++; } else { fail++; console.log(`  [FAIL] ${name} — ${detail}`); }
}
function info(name, detail) { results.push({ name, ok: null, detail }); console.log(`  [INFO] ${name} — ${detail}`); }

// ---- http helper -----------------------------------------------------------
async function api(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  let payload;
  if (form) { payload = form; }
  else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const ct = res.headers.get("content-type") || "";
  let data = null;
  if (ct.includes("application/json")) data = await res.json().catch(() => null);
  else data = await res.text().catch(() => null);
  return { status: res.status, data, ct };
}

// ---- TOTP (matches server lib/mfa.ts) --------------------------------------
function base32Decode(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  s = s.toUpperCase().replace(/=+$/, "");
  let bits = 0, val = 0; const out = [];
  for (const c of s) { const i = A.indexOf(c); if (i < 0) continue; val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; } }
  return Buffer.from(out);
}
function totp(secret, offset = 0) {
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / 30) + offset;
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", key).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h[o] & 0x7f) << 24) | ((h[o + 1] & 0xff) << 16) | ((h[o + 2] & 0xff) << 8) | (h[o + 3] & 0xff);
  return String(code % 1000000).padStart(6, "0");
}

// ---- auth ------------------------------------------------------------------
async function loginDirect(email, password) {
  const r = await api("POST", "/auth/login", { body: { email, password } });
  return r;
}
async function loginWithMfaSetup(email, password) {
  const r = await loginDirect(email, password);
  if (r.data?.accessToken) return { token: r.data.accessToken, mfa: "none" };
  if (r.data?.mfaSetupRequired) {
    const mfaToken = r.data.mfaToken;
    const setup = await api("POST", "/auth/mfa/setup", { token: mfaToken });
    const secret = setup.data.secret;
    const code = totp(secret);
    const verify = await api("POST", "/auth/mfa/verify-setup", { token: mfaToken, body: { code } });
    return { token: verify.data?.accessToken, mfa: "setup", secret, recoveryCodes: verify.data?.recoveryCodes, raw: verify };
  }
  if (r.data?.mfaRequired) return { token: null, mfa: "enrolled-need-secret", raw: r };
  return { token: null, mfa: "unknown", raw: r };
}

async function main() {
  console.log("=== BRANDING ===");

  // Public GET — no auth
  let r = await api("GET", "/branding");
  check("branding: GET public 200", r.status === 200, `got ${r.status}`);
  check("branding: GET has name/colors/logos", !!r.data?.name && !!r.data?.colors?.primary && "logos" in (r.data ?? {}), JSON.stringify(r.data)?.slice(0, 200));
  check("branding: colors are oklch strings", typeof r.data?.colors?.primary === "string" && r.data.colors.primary.startsWith("oklch("), r.data?.colors?.primary);

  // Auth
  const admin = await loginWithMfaSetup("admin@jabeen.sa", "Admin@2026!");
  const pm = await loginWithMfaSetup("pm1@jabeen.sa", "Manager@2026!");
  const inv = await loginDirect("investor1@acmecorp.com", "Investor@2026!");
  const invToken = inv.data?.accessToken;
  check("branding: test logins ok", !!admin.token && !!pm.token && !!invToken, "login failure — reseed DB (down -v) and retry");

  const validBody = {
    name: "Test Brand",
    colors: {
      primary: "oklch(0.55 0.18 265)", secondary: "oklch(0.65 0.12 200)",
      accent: "oklch(0.75 0.15 80)", success: "oklch(0.65 0.15 145)",
      warning: "oklch(0.75 0.15 85)", error: "oklch(0.6 0.2 25)",
    },
    logos: { light: null, dark: null, favicon: null },
  };

  // PUT authorization matrix
  r = await api("PUT", "/branding", { body: validBody });
  check("branding: PUT unauthenticated 401", r.status === 401, `got ${r.status}`);
  r = await api("PUT", "/branding", { token: invToken, body: validBody });
  check("branding: PUT investor 403", r.status === 403, `got ${r.status}`);

  // PUT validation
  r = await api("PUT", "/branding", { token: admin.token, body: { ...validBody, colors: { ...validBody.colors, primary: "#ff0000" } } });
  check("branding: PUT non-oklch color 400", r.status === 400, `got ${r.status}`);
  r = await api("PUT", "/branding", { token: admin.token, body: { name: "x" } });
  check("branding: PUT missing colors 400", r.status === 400, `got ${r.status}`);

  // PUT round-trip (admin), then PM
  r = await api("PUT", "/branding", { token: admin.token, body: validBody });
  check("branding: PUT admin 200", r.status === 200, `got ${r.status}`);
  r = await api("GET", "/branding");
  check("branding: GET returns saved config", r.data?.name === "Test Brand" && JSON.stringify(r.data?.colors) === JSON.stringify(validBody.colors), JSON.stringify(r.data)?.slice(0, 200));
  r = await api("PUT", "/branding", { token: pm.token, body: { ...validBody, name: "PM Brand" } });
  check("branding: PUT project-manager 200", r.status === 200, `got ${r.status}`);

  // Logo upload
  // 1x1 transparent PNG
  const pngBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  let form = new FormData();
  form.append("file", new Blob([pngBytes], { type: "image/png" }), "logo.png");
  r = await api("POST", "/branding/logo", { token: admin.token, form });
  check("branding: logo upload png 201", r.status === 201 && !!r.data?.key, `got ${r.status} ${JSON.stringify(r.data)}`);
  const pngKey = r.data?.key;

  // Serve it back (public)
  r = await api("GET", `/branding/logo/${pngKey}`);
  check("branding: logo served 200 image/png", r.status === 200 && r.ct.includes("image/png"), `got ${r.status} ${r.ct}`);

  // SVG upload
  const svgBytes = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>`);
  form = new FormData();
  form.append("file", new Blob([svgBytes], { type: "image/svg+xml" }), "logo.svg");
  r = await api("POST", "/branding/logo", { token: admin.token, form });
  check("branding: logo upload svg 201", r.status === 201 && !!r.data?.key, `got ${r.status}`);

  // Rejections
  form = new FormData();
  form.append("file", new Blob([Buffer.from("MZ90000")], { type: "image/png" }), "fake.png");
  r = await api("POST", "/branding/logo", { token: admin.token, form });
  check("branding: mismatched magic bytes rejected", r.status === 415, `got ${r.status}`);
  form = new FormData();
  form.append("file", new Blob([pngBytes], { type: "application/pdf" }), "doc.pdf");
  r = await api("POST", "/branding/logo", { token: admin.token, form });
  check("branding: disallowed type rejected", r.status >= 400, `got ${r.status}`);
  r = await api("POST", "/branding/logo", { token: invToken });
  check("branding: investor upload 403", r.status === 403, `got ${r.status}`);

  // Path traversal on serve
  r = await api("GET", "/branding/logo/..%2F..%2Fpackage.json");
  check("branding: traversal key 404", r.status === 404 || r.status === 400, `got ${r.status}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();
