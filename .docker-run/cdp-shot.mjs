// Minimal Chrome DevTools Protocol driver (Node built-in fetch + WebSocket).
// Logs in as the investor by calling the API in-page, then screenshots.
import { writeFileSync } from "node:fs";

const [, , email, password, outPath] = process.argv;
const BASE = "http://127.0.0.1:9222";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Find the page target.
let target;
for (let i = 0; i < 30; i++) {
  try {
    const list = await (await fetch(`${BASE}/json`)).json();
    target = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    if (target) break;
  } catch {}
  await sleep(500);
}
if (!target) throw new Error("No CDP page target found");

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

const evalExpr = async (expression) => {
  const r = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
};

await send("Page.enable");
await send("Runtime.enable");

await send("Page.navigate", { url: "http://localhost:5173/" });
await sleep(2500);

// Log in via the same-origin API, store the bearer token the app expects.
const loginResult = await evalExpr(`(async () => {
  const r = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(password)} }),
    credentials: 'include',
  });
  const j = await r.json();
  if (j.accessToken) localStorage.setItem('jabeen_access_token', j.accessToken);
  return { status: r.status, hasToken: !!j.accessToken, role: j.user && j.user.role };
})()`);
console.log("login:", JSON.stringify(loginResult));

await evalExpr("location.reload()");
await sleep(4500);

const path = await evalExpr("location.pathname");
const heading = await evalExpr(
  "(document.querySelector('h1,h2') && document.querySelector('h1,h2').innerText) || ''"
);
console.log("after-login path:", path, "| heading:", heading);

const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(outPath, Buffer.from(shot.data, "base64"));
console.log("saved:", outPath);
ws.close();
process.exit(0);
