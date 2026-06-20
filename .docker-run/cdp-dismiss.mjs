import { writeFileSync } from "node:fs";
const [, , outPath] = process.argv;
const BASE = "http://127.0.0.1:9222";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await (await fetch(`${BASE}/json`)).json();
const target = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0; const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const mid = ++id; pending.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params })); });

await send("Page.enable");
await send("Runtime.enable");
// Press Escape to dismiss the dev error overlay.
for (const type of ["keyDown", "keyUp"]) {
  await send("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
}
await sleep(1200);
const heading = await send("Runtime.evaluate", { expression: "[...document.querySelectorAll('h1,h2,h3')].map(e=>e.innerText).slice(0,8).join(' | ')", returnByValue: true });
console.log("headings:", heading.result.value);
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(outPath, Buffer.from(shot.data, "base64"));
console.log("saved:", outPath);
ws.close(); process.exit(0);
