import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

/**
 * The DGA "Platforms Code" packages (`platformscode-new-react` /
 * `@platformscode/core`) ship a global, UNLAYERED CSS reset — most importantly
 * `@platformscode/core/dist/core/core.css`, which the Stencil component runtime
 * auto-injects. Its `*{margin:0;padding:0}` / `html{font-size:62.5%}` rules beat
 * Tailwind v4's layered utilities (unlayered > any layer), zeroing all spacing
 * app-wide. We can't change how the runtime injects it, so we wrap every DGA
 * package stylesheet in `@layer dga` at transform time. Combined with the
 * `@layer dga, theme, base, components, utilities;` order declared in index.css,
 * the reset ranks below Tailwind and stops bleeding into the app. DGA components
 * use Shadow DOM, so their visuals are unaffected by this layering.
 */
function dgaCssInLayer() {
  return {
    name: "dga-css-in-layer",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      const file = id.split("?")[0];
      if (
        file.endsWith(".css") &&
        (file.includes("@platformscode/core") ||
          file.includes("platformscode-new-react"))
      ) {
        return { code: `@layer dga {\n${code}\n}`, map: null };
      }
      return null;
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    dgaCssInLayer(),
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
