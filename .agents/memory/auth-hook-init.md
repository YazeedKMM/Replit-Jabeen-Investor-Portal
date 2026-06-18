---
name: Auth hook stable init pattern
description: How to write the silent-refresh initialization in use-auth.tsx without causing an infinite loop.
---

The `AuthProvider` silent-refresh init must use a `useRef(false)` guard with an empty deps `[]` `useEffect` to run exactly once on mount.

**Why:** Any dependency in the effect (including mutation refs or query functions) causes React to re-run the effect, which re-triggers the refresh endpoint in a tight loop.

**How to apply:**
```ts
const initRef = useRef(false);
useEffect(() => {
  if (initRef.current) return;
  initRef.current = true;
  async function initAuth() {
    const resp = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
    if (resp.ok) { /* store token */ }
    setIsInitializing(false);
  }
  initAuth();
}, []); // empty deps — intentionally runs once
```

Use native `fetch` (not `customFetch` from the api-client) for this call. `customFetch` is an internal Orval detail and is not exported from `@workspace/api-client-react`.
