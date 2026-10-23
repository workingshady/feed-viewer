import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const apiProxy = {
  "/api": { target: "http://127.0.0.1:8788", changeOrigin: true },
};

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: { overlay: false },
    proxy: apiProxy,
  },
  preview: { proxy: apiProxy },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  /**
   * No `manualChunks` here, deliberately.
   *
   * A hand-written vendor split (react-vendor / radix / query / router / recharts / maps) broke
   * the production build outright: the app rendered a black screen with
   * `Cannot read properties of undefined (reading 'forwardRef')`. React is CommonJS, so Rollup
   * wraps it in a lazy initialiser, and once its consumers are placed in sibling chunks one of
   * them can execute before that initialiser has run. Rollup's automatic chunking respects these
   * initialisation dependencies. Only revisit this with `npm run test:e2e` as the gate.
   */
});
