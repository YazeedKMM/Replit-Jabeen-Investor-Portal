import { createRoot } from "react-dom/client";
import { Suspense } from "react";
import App from "./App";
import "./i18n";
import { installDgaLayerGuard } from "@/lib/dga-layer-guard";
// CSS load order:
//   1. App Tailwind stylesheet — declares the cascade-layer order so `dga` ranks
//      below Tailwind (see index.css). Its utilities/preflight win over the reset.
//   2. DGA tokens + components CSS — wrapped into `@layer dga` by the dgaCssInLayer
//      Vite plugin (same as the runtime-injected core.css), so its global reset
//      can't clobber the app. Provides the DGA design tokens.
//   3. JABEEN gold brand override — unlayered, so its token overrides win.
import "./index.css";
import "platformscode-new-react/dist/style.css";
import "@/styles/jabeen-dga-brand.css";

// Demote the DGA Stencil runtime-injected global reset into @layer dga so it
// can't clobber Tailwind utilities (header flex, spacing, focus outline).
// Must run before the first DGA component mounts (i.e. before render).
installDgaLayerGuard();

createRoot(document.getElementById("root")!).render(
  <Suspense fallback={null}>
    <App />
  </Suspense>,
);
