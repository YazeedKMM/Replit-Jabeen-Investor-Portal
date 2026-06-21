// Heavy cross-role integration test suite for the JABEEN Investor Portal API.
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

const A = {}; // role -> token

async function main() {
  console.log("=== AUTHENTICATION ===");
  // Wrong password
  let r = await loginDirect("admin@jabeen.sa", "wrong");
  check("login: wrong password rejected", r.status === 401, `got ${r.status}`);
  // Unknown email
  r = await loginDirect("nobody@nowhere.sa", "x");
  check("login: unknown email rejected", r.status === 401, `got ${r.status}`);

  // Investors (no MFA)
  r = await loginDirect("investor1@acmecorp.com", "Investor@2026!");
  A.inv1 = r.data?.accessToken; check("login: investor1 direct token", !!A.inv1, `status ${r.status}`);
  r = await loginDirect("investor2@gulfpetro.com", "Investor@2026!");
  A.inv2 = r.data?.accessToken; check("login: investor2 direct token", !!A.inv2, `status ${r.status}`);

  // Top management now also requires MFA (#4 policy hardening)
  let s = await loginWithMfaSetup("tm1@jabeen.sa", "TopMgmt@2026!");
  A.tm = s.token; A.tmSecret = s.secret;
  check("login: top-management via MFA setup (#4 now MFA-required)", !!A.tm && s.mfa === "setup", `mfa=${s.mfa} ${JSON.stringify(s.raw?.data||"").slice(0,120)}`);

  // Admin + PM (MFA setup required)
  s = await loginWithMfaSetup("admin@jabeen.sa", "Admin@2026!");
  A.admin = s.token; A.adminSecret = s.secret;
  check("login: admin via MFA setup", !!A.admin, `mfa=${s.mfa} ${JSON.stringify(s.raw?.data||"").slice(0,120)}`);
  check("MFA setup returns recovery codes", Array.isArray(s.recoveryCodes) && s.recoveryCodes.length === 8, `got ${s.recoveryCodes?.length}`);
  s = await loginWithMfaSetup("pm1@jabeen.sa", "Manager@2026!");
  A.pm = s.token; A.pmSecret = s.secret;
  check("login: pm via MFA setup", !!A.pm, `mfa=${s.mfa}`);

  // City + category id maps for project creation / scoping tests
  const CITY = {}, CAT = {};
  { const rc = await api("GET", "/cities", { token: A.pm });
    for (const c of (rc.data || [])) CITY[c.code] = c.id;
    const rk = await api("GET", "/project-categories", { token: A.pm });
    for (const c of (rk.data || [])) CAT[c.code] = c.id; }
  check("cities: list reachable by PM", Object.keys(CITY).length >= 4, `codes ${Object.keys(CITY)}`);
  check("categories: list reachable by PM", Object.keys(CAT).length >= 5, `codes ${Object.keys(CAT)}`);

  // #5: re-running setup on an already-enrolled account must not clobber it
  r = await api("POST", "/auth/mfa/setup", { token: A.admin });
  check("MFA setup on already-enrolled account -> 409 (#5)", r.status === 409, `got ${r.status}`);

  // /auth/me per role
  for (const [role, tok] of [["admin", A.admin], ["pm", A.pm], ["tm", A.tm], ["inv1", A.inv1]]) {
    r = await api("GET", "/auth/me", { token: tok });
    check(`auth/me: ${role}`, r.status === 200 && !!r.data?.email, `status ${r.status}`);
    check(`auth/me: ${role} hides passwordHash/mfaSecret`, !r.data?.passwordHash && !r.data?.mfaSecret, "leak");
  }

  // Profile update
  r = await api("PATCH", "/auth/me", { token: A.inv1, body: { phone: "+966500000000" } });
  check("auth/me PATCH: investor updates phone", r.status === 200 && r.data?.phone === "+966500000000", `status ${r.status}`);

  // Re-login enrolled admin via TOTP verify path
  r = await loginDirect("admin@jabeen.sa", "Admin@2026!");
  if (r.data?.mfaRequired) {
    const v = await api("POST", "/auth/mfa/verify", { token: r.data.mfaToken, body: { code: totp(A.adminSecret) } });
    check("login: admin re-login via TOTP verify", !!v.data?.accessToken, `status ${v.status}`);
    const bad = await api("POST", "/auth/mfa/verify", { token: r.data.mfaToken, body: { code: "000000" } });
    check("MFA verify: wrong code rejected", bad.status === 401, `got ${bad.status}`);
  } else {
    check("login: admin re-login requires MFA", false, `expected mfaRequired, got ${JSON.stringify(r.data).slice(0,80)}`);
  }

  console.log("\n=== PROJECTS ===");
  // Investor scoping
  r = await api("GET", "/projects", { token: A.inv1 });
  check("projects: investor1 sees only own (across cities)", r.status === 200 && r.data.length === 2 && r.data.every(p => p.id === 1 || p.id === 3), `count ${r.data?.length}`);
  check("projects: investor project carries city+category", !!r.data?.[0]?.city && !!r.data?.[0]?.category, `city=${!!r.data?.[0]?.city} cat=${!!r.data?.[0]?.category}`);
  check("projects: investor list hides other investor contact", r.data?.[0]?.investor == null, "investor contact leaked to owner-investor (n/a)");
  r = await api("GET", "/projects/2", { token: A.inv1 });
  check("projects: investor1 GET other project -> 404", r.status === 404, `got ${r.status}`);
  r = await api("GET", "/projects/1", { token: A.inv1 });
  check("projects: investor1 GET own project", r.status === 200 && r.data.id === 1, `got ${r.status}`);
  // Privileged listing
  r = await api("GET", "/projects", { token: A.tm });
  check("projects: TM sees all (2+)", r.status === 200 && r.data.length >= 2, `count ${r.data?.length}`);
  check("projects: TM sees investor contact", !!r.data?.find(p => p.investor), "no investor enriched");
  // Investor cannot create
  r = await api("POST", "/projects", { token: A.inv1, body: { name: "x", cityId: CITY.JUB, categoryId: CAT.PETRO, agreementNumber: "Z-"+ts } });
  check("projects: investor POST -> 403", r.status === 403, `got ${r.status}`);
  // TM cannot create / export (read-only)
  r = await api("POST", "/projects", { token: A.tm, body: { name: "x", cityId: CITY.JUB, categoryId: CAT.PETRO, agreementNumber: "Z2-"+ts } });
  check("projects: TM POST -> 403", r.status === 403, `got ${r.status}`);
  r = await api("GET", "/projects/export", { token: A.tm });
  check("projects: TM export -> 403", r.status === 403, `got ${r.status}`);
  // PM create
  r = await api("POST", "/projects", { token: A.pm, body: { name: "Test Facility "+ts, cityId: CITY.JUB, categoryId: CAT.PETRO, agreementNumber: "TST-"+ts, plotNumber: "P-"+ts, constructionPct: 10, investorId: 4 } });
  const projId = r.data?.id;
  check("projects: PM create -> 201", r.status === 201 && !!projId, `status ${r.status} ${JSON.stringify(r.data).slice(0,120)}`);
  // invalid investor (assign a PM as investor)
  r = await api("POST", "/projects", { token: A.pm, body: { name: "Bad", cityId: CITY.JUB, categoryId: CAT.PETRO, agreementNumber: "BAD-"+ts, investorId: 2 } });
  check("projects: create with non-investor investorId -> 400", r.status === 400, `got ${r.status}`);
  // constructionPct out of range
  r = await api("POST", "/projects", { token: A.pm, body: { name: "Range", cityId: CITY.JUB, categoryId: CAT.PETRO, agreementNumber: "RNG-"+ts, constructionPct: 150 } });
  check("projects: constructionPct=150 should be rejected (<=100)", r.status === 400, `got ${r.status} (constructionPct=${r.data?.constructionPct})`);
  const rangeProjId = r.data?.id;
  // Optimistic concurrency
  r = await api("PATCH", `/projects/${projId}`, { token: A.pm, body: { name: "No version" } });
  check("projects: PATCH without version -> 400", r.status === 400 && r.data?.code === "VERSION_REQUIRED", `got ${r.status}`);
  r = await api("PATCH", `/projects/${projId}`, { token: A.pm, body: { name: "Stale", version: 999 } });
  check("projects: PATCH stale version -> 409", r.status === 409, `got ${r.status}`);
  r = await api("PATCH", `/projects/${projId}`, { token: A.pm, body: { name: "Renamed "+ts, version: 1 } });
  check("projects: PATCH valid -> 200 & version bumps", r.status === 200 && r.data?.version === 2, `status ${r.status} v=${r.data?.version}`);
  r = await api("PATCH", `/projects/${projId}`, { token: A.inv1, body: { name: "x", version: 2 } });
  check("projects: investor PATCH -> 403", r.status === 403, `got ${r.status}`);
  // Export by PM
  r = await api("GET", "/projects/export", { token: A.pm });
  check("projects: PM export CSV", r.status === 200 && r.ct.includes("text/csv"), `status ${r.status} ct=${r.ct}`);
  // Delete: PM forbidden, admin ok
  r = await api("DELETE", `/projects/${projId}`, { token: A.pm });
  check("projects: PM delete -> 403", r.status === 403, `got ${r.status}`);
  r = await api("DELETE", `/projects/${projId}`, { token: A.admin });
  check("projects: admin delete -> 204", r.status === 204, `got ${r.status}`);
  if (rangeProjId) await api("DELETE", `/projects/${rangeProjId}`, { token: A.admin });

  console.log("\n=== CITY SCOPING & CATALOG ===");
  // PM sees only assigned-city projects (JUB/YNB)
  r = await api("GET", "/projects", { token: A.pm });
  const pmCityIds = new Set((r.data||[]).map(p => p.cityId));
  check("scoping: pm1 list excludes RAS/JZN", r.status === 200 && !pmCityIds.has(CITY.RAS) && !pmCityIds.has(CITY.JZN), `cities ${[...pmCityIds]}`);
  check("scoping: pm1 list includes JUB/YNB", pmCityIds.has(CITY.JUB) || pmCityIds.has(CITY.YNB), `cities ${[...pmCityIds]}`);
  // PM direct access to an out-of-scope project -> 403 (project 3 = RAS, project 4 = JZN)
  r = await api("GET", "/projects/3", { token: A.pm });
  check("scoping: pm1 GET RAS project -> 403", r.status === 403, `got ${r.status}`);
  r = await api("GET", "/projects/4", { token: A.pm });
  check("scoping: pm1 GET JZN project -> 403", r.status === 403, `got ${r.status}`);
  r = await api("PATCH", "/projects/3", { token: A.pm, body: { name: "x", version: 1 } });
  check("scoping: pm1 PATCH RAS project -> 403", r.status === 403, `got ${r.status}`);
  // PM create in an unassigned city -> 403
  r = await api("POST", "/projects", { token: A.pm, body: { name: "Scope "+ts, cityId: CITY.RAS, categoryId: CAT.MINING, agreementNumber: "SCP-"+ts } });
  check("scoping: pm1 create in RAS -> 403", r.status === 403, `got ${r.status}`);
  // Missing cityId/categoryId -> 400
  r = await api("POST", "/projects", { token: A.pm, body: { name: "NoCity "+ts, agreementNumber: "NOC-"+ts } });
  check("projects: create missing cityId/categoryId -> 400", r.status === 400, `got ${r.status}`);
  // Admin & TM see all four cities
  r = await api("GET", "/projects", { token: A.admin });
  const adminCityIds = new Set((r.data||[]).map(p => p.cityId));
  check("scoping: admin sees all 4 cities", [CITY.JUB,CITY.YNB,CITY.RAS,CITY.JZN].every(id => adminCityIds.has(id)), `cities ${[...adminCityIds]}`);
  r = await api("GET", "/projects", { token: A.tm });
  const tmCityIds = new Set((r.data||[]).map(p => p.cityId));
  check("scoping: TM sees RAS & JZN too", tmCityIds.has(CITY.RAS) && tmCityIds.has(CITY.JZN), `cities ${[...tmCityIds]}`);
  // ?cityId filter (admin) returns only that city
  r = await api("GET", `/projects?cityId=${CITY.JUB}`, { token: A.admin });
  check("filter: ?cityId=JUB returns only JUB", r.status === 200 && r.data.length > 0 && r.data.every(p => p.cityId === CITY.JUB), `n=${r.data?.length}`);
  // Cities CRUD authorization
  r = await api("POST", "/cities", { token: A.pm, body: { code: "X1", name: "X", shortName: "X" } });
  check("cities: PM create -> 403", r.status === 403, `got ${r.status}`);
  r = await api("POST", "/cities", { token: A.inv1, body: { code: "X1", name: "X", shortName: "X" } });
  check("cities: investor create -> 403", r.status === 403, `got ${r.status}`);
  r = await api("POST", "/cities", { token: A.admin, body: { code: "TST"+ts.toString().slice(-4), name: "Test City", shortName: "TestCity" } });
  const testCityId = r.data?.id;
  check("cities: admin create -> 201", r.status === 201 && !!testCityId, `got ${r.status}`);
  // Categories CRUD authorization
  r = await api("POST", "/project-categories", { token: A.pm, body: { code: "C1", name: "C" } });
  check("categories: PM create -> 403", r.status === 403, `got ${r.status}`);
  r = await api("POST", "/project-categories", { token: A.admin, body: { code: "TSTC"+ts.toString().slice(-4), name: "Test Category" } });
  const testCatId = r.data?.id;
  check("categories: admin create -> 201", r.status === 201 && !!testCatId, `got ${r.status}`);
  // In-use guards: cannot disable/delete a city/category with projects
  r = await api("PATCH", `/cities/${CITY.JUB}`, { token: A.admin, body: { enabled: false } });
  check("cities: disable in-use JUB -> 409", r.status === 409, `got ${r.status}`);
  r = await api("DELETE", `/cities/${CITY.JUB}`, { token: A.admin });
  check("cities: delete in-use JUB -> 409", r.status === 409, `got ${r.status}`);
  r = await api("PATCH", `/project-categories/${CAT.PETRO}`, { token: A.admin, body: { enabled: false } });
  check("categories: disable in-use PETRO -> 409", r.status === 409, `got ${r.status}`);
  // Cleanup the throwaway test city/category (they have no projects)
  if (testCityId) { r = await api("DELETE", `/cities/${testCityId}`, { token: A.admin }); check("cities: delete unused test city -> 204", r.status === 204, `got ${r.status}`); }
  if (testCatId) { r = await api("DELETE", `/project-categories/${testCatId}`, { token: A.admin }); check("categories: delete unused test category -> 204", r.status === 204, `got ${r.status}`); }

  console.log("\n=== TEMPLATES ===");
  r = await api("GET", "/templates", { token: A.pm });
  check("templates: PM list", r.status === 200 && r.data.length >= 1, `count ${r.data?.length}`);
  r = await api("GET", "/templates", { token: A.inv1 });
  check("templates: investor GET /templates -> 403 (#1)", r.status === 403, `got ${r.status}`);
  r = await api("GET", "/templates", { token: A.tm });
  check("templates: TM GET /templates -> 200 (privileged read)", r.status === 200, `got ${r.status}`);
  // Build a valid template
  const goodTpl = { name: "QA Template "+ts, description: "d", stages: [
    { name: "Stage A", category: "active", progressBaseline: 0, fields: [ { name: "Notes", baseType: "text", widget: "multi-line", required: false } ] },
    { name: "Done", category: "complete", progressBaseline: 100, fields: [] },
  ]};
  r = await api("POST", "/templates", { token: A.pm, body: goodTpl });
  const newTplId = r.data?.id;
  check("templates: PM create valid -> 201", r.status === 201 && !!newTplId, `status ${r.status} ${JSON.stringify(r.data).slice(0,120)}`);
  // incompatible widget
  r = await api("POST", "/templates", { token: A.pm, body: { name: "Bad", stages: [ { name: "s", category: "active", fields: [ { name: "f", baseType: "number", widget: "multi-line" } ] } ] } });
  check("templates: incompatible widget -> 400", r.status === 400, `got ${r.status}`);
  // choice with no options
  r = await api("POST", "/templates", { token: A.pm, body: { name: "Bad2", stages: [ { name: "s", category: "active", fields: [ { name: "f", baseType: "single-choice", widget: "radio", options: [] } ] } ] } });
  check("templates: choice field no options -> 400", r.status === 400, `got ${r.status}`);
  // investor create
  r = await api("POST", "/templates", { token: A.inv1, body: { name: "nope" } });
  check("templates: investor create -> 403", r.status === 403, `got ${r.status}`);
  // PUT never-assigned (mutate in place)
  r = await api("PUT", `/templates/${newTplId}`, { token: A.pm, body: { name: "QA Template Renamed "+ts } });
  check("templates: PUT never-assigned mutates in place", r.status === 200 && r.data?.versionCreated === false, `status ${r.status} vc=${r.data?.versionCreated}`);
  // Assign a throwaway project to this template, then PUT -> immutable, must version.
  r = await api("POST", "/projects", { token: A.pm, body: { name: "Tpl Assign "+ts, cityId: CITY.JUB, categoryId: CAT.PETRO, agreementNumber: "TPLA-"+ts, pipelineId: newTplId } });
  const tplAssignProj = r.data?.id;
  r = await api("PUT", `/templates/${newTplId}`, { token: A.pm, body: { name: "QA v2 "+ts, description: "v2" } });
  check("templates: PUT assigned template creates new version", r.status === 200 && r.data?.versionCreated === true, `status ${r.status} vc=${r.data?.versionCreated}`);
  const versionedTplId = r.data?.template?.id;
  // archived original cannot be edited
  r = await api("PUT", `/templates/${newTplId}`, { token: A.pm, body: { name: "x" } });
  check("templates: PUT archived version -> 409", r.status === 409, `got ${r.status}`);
  // cleanup: unassign + delete project, archive new version
  if (tplAssignProj) await api("DELETE", `/projects/${tplAssignProj}`, { token: A.admin });
  if (versionedTplId) {
    r = await api("POST", `/templates/${versionedTplId}/archive`, { token: A.pm });
    check("templates: archive -> 200", r.status === 200 && r.data?.archived, `got ${r.status}`);
  }

  console.log("\n=== UPDATES / REVIEW WORKFLOW ===");
  // Get pipeline stages for project 1
  r = await api("GET", "/projects/1", { token: A.pm });
  const stages = r.data?.pipeline?.stages || [];
  const curStageIdx = stages.findIndex(st => st.id === r.data?.currentStageId);
  const nextStage = stages[curStageIdx + 1] || stages[curStageIdx];
  const earlierStage = stages[0];
  // Investor submits update
  r = await api("POST", "/projects/1/updates", { token: A.inv1, body: { targetStageId: nextStage.id, note: "Investor progress", constructionPct: 45 } });
  const invUpdateId = r.data?.id;
  check("updates: investor submit -> 201 pending", r.status === 201 && r.data?.reviewStatus === "pending", `status ${r.status} rs=${r.data?.reviewStatus}`);
  // Second pending blocked
  r = await api("POST", "/projects/1/updates", { token: A.inv1, body: { targetStageId: nextStage.id, note: "dup" } });
  check("updates: investor second pending -> 409", r.status === 409, `got ${r.status}`);
  // Bad target stage (foreign)
  r = await api("POST", "/projects/1/updates", { token: A.inv1, body: { targetStageId: 99999 } });
  check("updates: bad target stage -> 422", r.status === 422, `got ${r.status}`);
  // TM submit update (should be read-only -> expect 403)
  r = await api("POST", "/projects/1/updates", { token: A.tm, body: { targetStageId: nextStage.id, note: "TM update" } });
  check("updates: TM submit blocked (read-only)", r.status === 403, `got ${r.status} (rs=${r.data?.reviewStatus})`);
  const tmUpdateId = r.data?.id;
  // Investor approve own -> 403
  r = await api("PATCH", `/projects/1/updates/${invUpdateId}/approve`, { token: A.inv1 });
  check("updates: investor approve -> 403", r.status === 403, `got ${r.status}`);
  // PM approve investor update
  r = await api("PATCH", `/projects/1/updates/${invUpdateId}/approve`, { token: A.pm });
  check("updates: PM approve pending -> 200", r.status === 200 && r.data?.reviewStatus === "approved", `status ${r.status}`);
  // Double approve
  r = await api("PATCH", `/projects/1/updates/${invUpdateId}/approve`, { token: A.pm });
  check("updates: double approve -> 409", r.status === 409, `got ${r.status}`);
  // Backward movement: PM submits update to earlier stage -> auto-approve attempts backward? Manager submit advances directly.
  // Investor submits to earlier stage then PM approve -> expect 409 backward
  r = await api("POST", "/projects/1/updates", { token: A.inv1, body: { targetStageId: earlierStage.id, note: "backward" } });
  const backId = r.data?.id;
  if (backId) {
    r = await api("PATCH", `/projects/1/updates/${backId}/approve`, { token: A.pm });
    check("updates: approve backward stage -> 409", r.status === 409, `got ${r.status}`);
    // reject it to clean up
    await api("PATCH", `/projects/1/updates/${backId}/reject`, { token: A.pm, body: { reviewNote: "cleanup" } });
  } else info("updates: backward test", "could not create backward update (maybe earlier==current)");
  // Reject flow: investor submit then PM reject
  r = await api("POST", "/projects/2/updates", { token: A.inv2, body: { targetStageId: null } });
  check("updates: missing targetStageId -> 400", r.status === 400, `got ${r.status}`);

  console.log("\n=== DOCUMENTS ===");
  // Investor upload text file to own project
  function txtForm(name) { const f = new FormData(); f.append("file", new Blob(["hello world"], { type: "text/plain" }), name); return f; }
  r = await api("POST", "/projects/1/documents", { token: A.inv1, form: txtForm("note.txt") });
  const docId = r.data?.id;
  check("documents: investor upload to own project -> 201", r.status === 201 && !!docId, `status ${r.status} ${JSON.stringify(r.data).slice(0,100)}`);
  // Investor upload to other project
  r = await api("POST", "/projects/2/documents", { token: A.inv1, form: txtForm("x.txt") });
  check("documents: investor upload to other project -> 404", r.status === 404, `got ${r.status}`);
  // TM upload (read-only -> expect 403)
  r = await api("POST", "/projects/1/documents", { token: A.tm, form: txtForm("tm.txt") });
  check("documents: TM upload blocked (read-only)", r.status === 403, `got ${r.status}`);
  const tmDocId = r.data?.id;
  // Spoofed signature: declare png but send text
  function spoofForm() { const f = new FormData(); f.append("file", new Blob(["not a real png"], { type: "image/png" }), "fake.png"); return f; }
  r = await api("POST", "/projects/1/documents", { token: A.inv1, form: spoofForm() });
  check("documents: spoofed png signature -> 415", r.status === 415, `got ${r.status}`);
  // List all: admin yes, PM no, investor no
  r = await api("GET", "/documents", { token: A.admin });
  check("documents: admin list all", r.status === 200, `got ${r.status}`);
  r = await api("GET", "/documents", { token: A.pm });
  check("documents: PM list all -> 403", r.status === 403, `got ${r.status}`);
  // Download scoped
  if (docId) {
    r = await api("GET", `/documents/${docId}/download`, { token: A.inv2 });
    check("documents: investor2 download inv1 doc -> 404", r.status === 404, `got ${r.status}`);
    r = await api("GET", `/documents/${docId}/download`, { token: A.inv1 });
    check("documents: investor1 download own doc", r.status === 200, `got ${r.status}`);
    // delete: PM forbidden, admin ok
    r = await api("DELETE", `/documents/${docId}`, { token: A.pm });
    check("documents: PM delete -> 403", r.status === 403, `got ${r.status}`);
    r = await api("DELETE", `/documents/${docId}`, { token: A.admin });
    check("documents: admin delete -> 204", r.status === 204, `got ${r.status}`);
  }
  if (tmDocId) await api("DELETE", `/documents/${tmDocId}`, { token: A.admin });

  console.log("\n=== MESSAGES ===");
  r = await api("POST", "/projects/1/messages", { token: A.inv1, body: { body: "Hello PM" } });
  check("messages: investor post own project -> 201", r.status === 201, `got ${r.status}`);
  r = await api("POST", "/projects/1/messages", { token: A.tm, body: { body: "TM msg" } });
  check("messages: TM post -> 403", r.status === 403, `got ${r.status}`);
  r = await api("POST", "/projects/2/messages", { token: A.inv1, body: { body: "x" } });
  check("messages: investor post other project -> 404", r.status === 404, `got ${r.status}`);
  r = await api("POST", "/projects/1/messages", { token: A.inv1, body: { body: "" } });
  check("messages: empty body -> 400", r.status === 400, `got ${r.status}`);
  r = await api("GET", "/projects/1/messages", { token: A.inv1 });
  check("messages: investor reads thread", r.status === 200 && Array.isArray(r.data), `got ${r.status}`);
  r = await api("GET", "/projects/1/messages", { token: A.tm });
  check("messages: TM reads thread (read-only ok)", r.status === 200, `got ${r.status}`);

  console.log("\n=== INTERNAL NOTES ===");
  r = await api("POST", "/projects/1/notes", { token: A.pm, body: { body: "internal note" } });
  check("notes: PM create", r.status === 201, `got ${r.status}`);
  r = await api("GET", "/projects/1/notes", { token: A.pm });
  check("notes: PM list", r.status === 200, `got ${r.status}`);
  r = await api("GET", "/projects/1/notes", { token: A.inv1 });
  check("notes: investor -> 403", r.status === 403, `got ${r.status}`);
  r = await api("GET", "/projects/1/notes", { token: A.tm });
  check("notes: TM (read-only) -> 403 (manager-only feature)", r.status === 403, `got ${r.status}`);

  console.log("\n=== NOTIFICATIONS ===");
  for (const [role, tok] of [["pm", A.pm], ["inv1", A.inv1]]) {
    r = await api("GET", "/notifications", { token: tok });
    check(`notifications: ${role} list`, r.status === 200 && Array.isArray(r.data), `got ${r.status}`);
    r = await api("GET", "/notifications/unread-count", { token: tok });
    check(`notifications: ${role} unread-count`, r.status === 200 && typeof r.data?.count === "number", `got ${r.status}`);
  }
  // mark one read (pm's first notif if any)
  r = await api("GET", "/notifications", { token: A.pm });
  const notifId = r.data?.[0]?.id;
  if (notifId) {
    r = await api("PATCH", `/notifications/${notifId}/read`, { token: A.pm });
    check("notifications: mark read", r.status === 200 && r.data?.read === true, `got ${r.status}`);
    // cross-user: investor marking pm notif
    r = await api("PATCH", `/notifications/${notifId}/read`, { token: A.inv1 });
    check("notifications: cross-user mark read -> 404", r.status === 404, `got ${r.status}`);
  }
  r = await api("PATCH", "/notifications/read-all", { token: A.pm });
  check("notifications: read-all -> 204", r.status === 204, `got ${r.status}`);

  console.log("\n=== DASHBOARD ===");
  for (const [role, tok, expect] of [["admin", A.admin, 200], ["pm", A.pm, 200], ["tm", A.tm, 200], ["inv1", A.inv1, 403]]) {
    r = await api("GET", "/dashboard", { token: tok });
    check(`dashboard: ${role} -> ${expect}`, r.status === expect, `got ${r.status}`);
    if (expect === 200) check(`dashboard: ${role} KPIs present`, typeof r.data?.total === "number" && Array.isArray(r.data?.byStatus) && Array.isArray(r.data?.byCategory) && Array.isArray(r.data?.byCity), "missing KPIs");
  }

  console.log("\n=== USERS / ADMIN ===");
  r = await api("GET", "/users", { token: A.admin });
  check("users: admin list", r.status === 200 && r.data.length >= 5, `count ${r.data?.length}`);
  r = await api("GET", "/users", { token: A.pm });
  check("users: PM list (manager)", r.status === 200, `got ${r.status}`);
  r = await api("GET", "/users", { token: A.inv1 });
  check("users: investor -> 403", r.status === 403, `got ${r.status}`);
  // #3 SQL filters
  r = await api("GET", "/users?role=investor", { token: A.admin });
  check("users: ?role=investor filter (#3 SQL)", r.status === 200 && r.data.length >= 2 && r.data.every(u => u.role === "investor"), `got ${r.status} n=${r.data?.length}`);
  r = await api("GET", "/users?status=active", { token: A.admin });
  check("users: ?status=active filter (#3 SQL)", r.status === 200 && r.data.every(u => u.status === "active"), `got ${r.status}`);
  r = await api("GET", "/users?role=bogus", { token: A.admin });
  check("users: invalid role filter -> [] not 500 (#3)", r.status === 200 && Array.isArray(r.data) && r.data.length === 0, `got ${r.status}`);
  r = await api("GET", "/users?search=gulf", { token: A.admin });
  check("users: ?search filter (#3 SQL ilike)", r.status === 200 && r.data.some(u => /gulf/i.test(u.companyName + u.email + u.fullName)), `got ${r.status} n=${r.data?.length}`);
  // Admin create TM
  r = await api("POST", "/users", { token: A.admin, body: { fullName: "QA TM "+ts, email: `qatm${ts}@jabeen.sa`, companyName: "JABEEN", role: "top-management" } });
  const tmUserId = r.data?.user?.id;
  check("users: admin create top-management -> 201 + tempPassword", r.status === 201 && !!r.data?.temporaryPassword, `got ${r.status}`);
  // PM cannot create non-investor
  r = await api("POST", "/users", { token: A.pm, body: { fullName: "x", email: `pmtm${ts}@x.sa`, companyName: "c", role: "top-management" } });
  check("users: PM create top-management -> 403", r.status === 403, `got ${r.status}`);
  // PM create investor ok
  r = await api("POST", "/users", { token: A.pm, body: { fullName: "PM Inv "+ts, email: `pminv${ts}@x.sa`, companyName: "c", role: "investor" } });
  const pmInvId = r.data?.user?.id;
  check("users: PM create investor -> 201", r.status === 201, `got ${r.status}`);
  // Admin PATCH invalid role (enum) — should be 400, watch for 500
  r = await api("PATCH", `/users/${tmUserId}`, { token: A.admin, body: { role: "superadmin" } });
  check("users: PATCH invalid role -> 400 (not 500)", r.status === 400, `got ${r.status} (${String(r.data).slice(0,60)})`);
  // Admin PATCH own account
  r = await api("PATCH", `/users/1`, { token: A.admin, body: { fullName: "x" } });
  check("users: admin PATCH self -> 400", r.status === 400, `got ${r.status}`);
  // reset password
  r = await api("POST", `/users/${tmUserId}/reset-password`, { token: A.admin });
  check("users: admin reset-password", r.status === 200 && !!r.data?.temporaryPassword, `got ${r.status}`);
  r = await api("POST", `/users/${tmUserId}/reset-password`, { token: A.pm });
  check("users: PM reset-password -> 403", r.status === 403, `got ${r.status}`);
  // Deactivation propagation
  const inv2Login = await loginDirect("investor2@gulfpetro.com", "Investor@2026!");
  const inv2Tok = inv2Login.data?.accessToken;
  r = await api("PATCH", `/users/5`, { token: A.admin, body: { status: "inactive" } });
  check("users: admin deactivate investor2", r.status === 200 && r.data?.status === "inactive", `got ${r.status}`);
  r = await api("GET", "/projects", { token: inv2Tok });
  check("users: deactivated token rejected immediately", r.status === 401, `got ${r.status}`);
  await api("PATCH", `/users/5`, { token: A.admin, body: { status: "active" } }); // restore
  // Activation flow
  const regEmail = `reg${ts}@investor.com`;
  r = await api("POST", "/auth/register", { body: { fullName: "Reg User", email: regEmail, password: "Password123", companyName: "RegCo" } });
  const regUserId = r.data?.user?.id;
  check("auth/register: new investor -> 201 pending", r.status === 201 && r.data?.user?.status === "pending", `got ${r.status} ${JSON.stringify(r.data?.user||"").slice(0,80)}`);
  const regTok = r.data?.accessToken;
  r = await api("GET", "/projects", { token: regTok });
  check("activation: pending investor blocked from protected route", r.status === 403, `got ${r.status}`);
  r = await api("POST", `/users/${regUserId}/activate`, { token: A.admin });
  check("activation: admin activate -> active", r.status === 200 && r.data?.status === "active", `got ${r.status}`);
  // MFA reset by admin
  r = await api("POST", `/users/${tmUserId}/mfa/reset`, { token: A.admin });
  check("users: admin mfa-reset -> 204", r.status === 204, `got ${r.status}`);
  // Delete: PM forbidden, admin ok (cleanup created users)
  r = await api("DELETE", `/users/${tmUserId}`, { token: A.pm });
  check("users: PM delete -> 403", r.status === 403, `got ${r.status}`);
  for (const uid of [tmUserId, pmInvId, regUserId].filter(Boolean)) {
    await api("DELETE", `/users/${uid}`, { token: A.admin });
  }

  console.log("\n=== AUDIT LOG ===");
  r = await api("GET", "/audit-log?page=1&limit=10", { token: A.admin });
  check("audit: admin paginated", r.status === 200 && Array.isArray(r.data?.entries) && typeof r.data?.total === "number", `got ${r.status}`);
  r = await api("GET", "/audit-log", { token: A.pm });
  check("audit: PM -> 403", r.status === 403, `got ${r.status}`);
  r = await api("GET", "/audit-log", { token: A.tm });
  check("audit: TM -> 403", r.status === 403, `got ${r.status}`);
  // #2 investor-contact-viewed dedup: view a fresh project's contact twice -> logged once
  r = await api("POST", "/projects", { token: A.pm, body: { name: "Audit Dedup "+ts, cityId: CITY.JUB, categoryId: CAT.PETRO, agreementNumber: "AUD-"+ts, investorId: 4 } });
  const auditProj = r.data?.id;
  if (auditProj) {
    const countCV = async () => {
      const a = await api("GET", "/audit-log?limit=500", { token: A.admin });
      return a.data.entries.filter(e => e.action === "investor-contact-viewed" && e.targetId === auditProj).length;
    };
    await api("GET", `/projects/${auditProj}`, { token: A.pm });
    const c1 = await countCV();
    await api("GET", `/projects/${auditProj}`, { token: A.pm });
    const c2 = await countCV();
    check("audit: investor-contact-viewed deduped within window (#2)", c1 === 1 && c2 === 1, `c1=${c1} c2=${c2}`);
    await api("DELETE", `/projects/${auditProj}`, { token: A.admin });
  }

  console.log("\n=== SETTINGS ===");
  r = await api("GET", "/settings", { token: A.admin });
  check("settings: admin read", r.status === 200 && typeof r.data?.stalledThresholdDays === "number", `got ${r.status}`);
  r = await api("GET", "/settings", { token: A.tm });
  check("settings: TM -> 403", r.status === 403, `got ${r.status}`);
  r = await api("PATCH", "/settings", { token: A.admin, body: { delayedThresholdDays: 25 } });
  check("settings: admin patch valid", r.status === 200 && r.data?.delayedThresholdDays === 25, `got ${r.status}`);
  r = await api("PATCH", "/settings", { token: A.admin, body: { delayedThresholdDays: "not-a-number" } });
  check("settings: patch invalid number -> rejected (not NaN)", r.status === 400 || (r.status === 200 && Number.isFinite(r.data?.delayedThresholdDays)), `got ${r.status} val=${r.data?.delayedThresholdDays}`);
  await api("PATCH", "/settings", { token: A.admin, body: { delayedThresholdDays: 30, stalledThresholdDays: 45 } }); // restore

  console.log("\n=== UNAUTH / EDGE ===");
  r = await api("GET", "/projects");
  check("edge: no token -> 401", r.status === 401, `got ${r.status}`);
  r = await api("GET", "/projects", { token: "garbage.token.here" });
  check("edge: garbage token -> 401", r.status === 401, `got ${r.status}`);
  r = await api("GET", "/projects/notanumber", { token: A.pm });
  check("edge: non-numeric projectId -> 404 (not 500)", r.status === 404, `got ${r.status}`);

  // ---- summary ----
  console.log("\n" + "=".repeat(60));
  console.log(`RESULTS: ${pass} passed, ${fail} failed, ${results.filter(r=>r.ok===null).length} info`);
  console.log("=".repeat(60));
  if (fail > 0) {
    console.log("\nFAILURES (candidate bugs):");
    for (const r of results.filter(r => r.ok === false)) console.log(`  - ${r.name} :: ${r.detail}`);
  }

  // Cleanup: reset admin/PM/TM MFA so the suite is re-runnable.
  if (A.admin) {
    await api("POST", "/users/1/mfa/reset", { token: A.admin }); // admin
    await api("POST", "/users/2/mfa/reset", { token: A.admin }); // pm1
    await api("POST", "/users/3/mfa/reset", { token: A.admin }); // tm1
    console.log("\n(cleanup) reset admin/PM/TM MFA enrollment");
  }
}

main().catch(e => { console.error("HARNESS ERROR:", e); process.exit(2); });
