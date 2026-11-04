// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Prévia e Publicar do Lovable: configuração padrão (com nitro).
// Hostinger (Apache, sem Node): BUILD_TARGET=hostinger npx vite build → SPA estático em dist/client/.
const hostinger = process.env.BUILD_TARGET === "hostinger";

export default defineConfig(
  hostinger
    ? {
        nitro: false,
        tanstackStart: {
          server: { entry: "server" },
          spa: {
            enabled: true,
            prerender: { outputPath: "/index.html", crawlLinks: false },
          },
        },
      }
    : {
        tanstackStart: {
          server: { entry: "server" },
        },
      },
);
