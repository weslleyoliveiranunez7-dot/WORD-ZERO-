import { defineConfig } from "vite";

// base "./" permite servir em GitHub Pages (subpasta) e dentro do Capacitor.
export default defineConfig({
  base: "./",
  server: { host: true, port: 5173 },
});
