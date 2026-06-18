---
name: tsx binary location
description: tsx is not in the root node_modules/.bin; use the pnpm hoisted path.
---

`tsx` is not available at `/home/runner/workspace/node_modules/.bin/tsx`.

**Use this path instead:**
```
/home/runner/workspace/node_modules/.pnpm/node_modules/.bin/tsx
```

**Why:** tsx is a transitive dependency hoisted by pnpm into the shared `.pnpm/node_modules` directory rather than the root `.bin` symlink directory.
