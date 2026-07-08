// Integration tests for the reports API on the JABEEN Investor Portal.
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
  console.log("=== REPORTS ===");

  // Unauthenticated
  let r = await api("GET", "/reports/distribution");
  check("reports: distribution unauthenticated 401", r.status === 401, `got ${r.status}`);

  // Logins
  const admin = await loginWithMfaSetup("admin@jabeen.sa", "Admin@2026!");
  const pm = await loginWithMfaSetup("pm1@jabeen.sa", "Manager@2026!");
  const tm = await loginWithMfaSetup("tm1@jabeen.sa", "TopMgmt@2026!");
  const inv = await loginDirect("investor1@acmecorp.com", "Investor@2026!");
  const invToken = inv.data?.accessToken;
  check("reports: test logins ok", !!admin.token && !!pm.token && !!tm.token && !!invToken,
    "login failure — reseed DB (down -v) and retry");

  // Investor 403 on all three
  for (const p of ["/reports/distribution", "/reports/stage-conversion", "/reports/activity"]) {
    r = await api("GET", p, { token: invToken });
    check(`reports: ${p} investor 403`, r.status === 403, `got ${r.status}`);
  }

  // Distribution — admin
  r = await api("GET", "/reports/distribution", { token: admin.token });
  check("reports: distribution admin 200", r.status === 200, `got ${r.status}`);
  const d = r.data ?? {};
  check("reports: distribution shape", Number.isInteger(d.total) && Number.isInteger(d.unstaged)
    && Array.isArray(d.byStage) && Array.isArray(d.byCity) && Array.isArray(d.byCategory),
    JSON.stringify(d).slice(0, 200));
  const stageSum = (d.byStage ?? []).reduce((s, x) => s + x.count, 0);
  check("reports: byStage + unstaged === total", stageSum + d.unstaged === d.total,
    `${stageSum} + ${d.unstaged} != ${d.total}`);
  const citySum = (d.byCity ?? []).reduce((s, x) => s + x.count, 0);
  check("reports: byCity sums to total", citySum === d.total, `${citySum} != ${d.total}`);
  const catSum = (d.byCategory ?? []).reduce((s, x) => s + x.count, 0);
  check("reports: byCategory sums to total", catSum === d.total, `${catSum} != ${d.total}`);
  check("reports: byStage items carry template linkage", (d.byStage ?? []).every((x) =>
    Number.isInteger(x.templateId) && typeof x.templateName === "string" &&
    Number.isInteger(x.templateVersion) && typeof x.templateArchived === "boolean"),
    JSON.stringify(d.byStage)?.slice(0, 200));
  const dash = await api("GET", "/dashboard", { token: admin.token });
  check("reports: total matches dashboard total", d.total === dash.data?.total,
    `${d.total} != ${dash.data?.total}`);

  // Distribution — PM and TM allowed
  r = await api("GET", "/reports/distribution", { token: pm.token });
  check("reports: distribution PM 200", r.status === 200, `got ${r.status}`);
  r = await api("GET", "/reports/distribution", { token: tm.token });
  check("reports: distribution TM 200", r.status === 200, `got ${r.status}`);

  // Stage conversion — default template
  r = await api("GET", "/reports/stage-conversion", { token: admin.token });
  check("reports: conversion 200", r.status === 200, `got ${r.status}`);
  const c = r.data ?? {};
  check("reports: conversion default template", c.templateName === "RCJY Standard Pipeline",
    c.templateName);
  check("reports: conversion has ordered stages", Array.isArray(c.stages) && c.stages.length >= 2
    && c.stages.every((s, i, a) => i === 0 || a[i - 1].orderIndex < s.orderIndex),
    JSON.stringify(c.stages)?.slice(0, 200));
  check("reports: conversion reached monotonic non-increasing",
    (c.stages ?? []).every((s, i, a) => i === 0 || a[i - 1].reached >= s.reached),
    JSON.stringify((c.stages ?? []).map((s) => s.reached)));
  const atSum = (c.stages ?? []).reduce((s, x) => s + x.atStage, 0);
  check("reports: conversion atStage sums <= totalProjects", atSum <= c.totalProjects,
    `${atSum} > ${c.totalProjects}`);
  check("reports: conversion reachedPct sane", (c.stages ?? []).every((s) =>
    Number.isInteger(s.reachedPct) && s.reachedPct >= 0 && s.reachedPct <= 100 &&
    (c.totalProjects === 0 ? s.reachedPct === 0 : s.reachedPct === Math.round((s.reached / c.totalProjects) * 100))),
    JSON.stringify((c.stages ?? []).map((s) => [s.reached, s.reachedPct])));

  // Stage conversion — param validation
  r = await api("GET", "/reports/stage-conversion?templateId=999999", { token: admin.token });
  check("reports: conversion unknown template 404", r.status === 404, `got ${r.status}`);
  r = await api("GET", "/reports/stage-conversion?templateId=abc", { token: admin.token });
  check("reports: conversion bad templateId 400", r.status === 400, `got ${r.status}`);

  // Activity — default 6 months
  r = await api("GET", "/reports/activity", { token: admin.token });
  check("reports: activity 200", r.status === 200, `got ${r.status}`);
  const months = r.data?.months ?? [];
  check("reports: activity 6 buckets", months.length === 6, `got ${months.length}`);
  check("reports: activity month format", months.every((m) => /^\d{4}-\d{2}$/.test(m.month)),
    JSON.stringify(months.map((m) => m.month)));
  const nowKey = new Date().toISOString().slice(0, 7);
  check("reports: activity last bucket is current month", months.at(-1)?.month === nowKey,
    `${months.at(-1)?.month} != ${nowKey}`);
  check("reports: activity counts are non-negative ints", months.every((m) =>
    Number.isInteger(m.projectsCreated) && m.projectsCreated >= 0 &&
    Number.isInteger(m.updatesSubmitted) && m.updatesSubmitted >= 0 &&
    Number.isInteger(m.updatesApproved) && m.updatesApproved >= 0), JSON.stringify(months).slice(0, 200));
  check("reports: activity counts seeded projects", months.reduce((s, m) => s + m.projectsCreated, 0) >= 1,
    "expected at least one seeded project in the window");

  // Activity — param validation and range
  r = await api("GET", "/reports/activity?months=0", { token: admin.token });
  check("reports: activity months=0 400", r.status === 400, `got ${r.status}`);
  r = await api("GET", "/reports/activity?months=25", { token: admin.token });
  check("reports: activity months=25 400", r.status === 400, `got ${r.status}`);
  r = await api("GET", "/reports/activity?months=24", { token: admin.token });
  check("reports: activity months=24 has 24 buckets", r.status === 200 && r.data?.months?.length === 24,
    `status ${r.status}, len ${r.data?.months?.length}`);

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
