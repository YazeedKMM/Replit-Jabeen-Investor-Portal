import { createRoot } from "react-dom/client";
import { Suspense } from "react";
import App from "./App";
import "./i18n";
import "./index.css";
// DGA Platforms Code tokens + components, then JABEEN gold brand override.
// Order matters: brand override MUST load after the package CSS.
import "platformscode-new-react/dist/style.css";
import "@/styles/jabeen-dga-brand.css";

createRoot(document.getElementById("root")!).render(
  <Suspense fallback={null}>
    <App />
  </Suspense>,
);
