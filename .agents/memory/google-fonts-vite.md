---
name: Google Fonts in Vite + Tailwind v4
description: Google Fonts must be a <link> tag in index.html, not @import url() in CSS.
---

In this project (Vite + Tailwind v4), Google Fonts must be loaded via a `<link>` tag in `index.html`:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

**Why:** Tailwind v4 processes and inlines CSS before the browser evaluates `@import url()` rules. This causes the font import to fail silently or trigger a PostCSS error.

**How to apply:** Never write `@import url("https://fonts.googleapis.com/...")` in any `.css` file in this project.
