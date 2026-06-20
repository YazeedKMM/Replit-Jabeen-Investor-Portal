// Dev-only Vite config used by the Docker run setup (.docker-run/).
// Extends the real vite.config.ts and adds a proxy so the SPA's same-origin
// /api/* calls reach the API server on localhost:8080.
import type { UserConfig } from "vite";
import base from "./vite.config";

const config = base as UserConfig;

export default {
  ...config,
  server: {
    ...config.server,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: false,
      },
    },
  },
} satisfies UserConfig;
