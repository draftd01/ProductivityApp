/**
 * vite.config.js - configuration for the Vite dev server and build.
 *
 * The important part is `server.proxy`: any request the React app makes to
 * /api/... is forwarded to Django on port 8000. That means the frontend code
 * (src/api/client.js) can use relative URLs like "/api/tasks/" and the
 * browser never makes a cross-origin request, so no CORS setup is needed.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
