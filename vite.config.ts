import { defineConfig, loadEnv } from "vite";
// @ts-expect-error type error without @types/node package
import { createHmac, timingSafeEqual } from "node:crypto";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), {
    name: "local-qr-verification",
    configureServer(server) {
      server.middlewares.use("/__dev/verify-qr", async (request, response) => {
        response.setHeader("Content-Type", "application/json");
        response.setHeader("Cache-Control", "no-store");
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        try {
          let body = "";
          for await (const chunk of request) {
            body += chunk;
            if (body.length > 16384) throw new Error("QR request too large");
          }
          const { token } = JSON.parse(body);
          const secret = loadEnv(mode, process.cwd(), "QR_").QR_SECRET;
          if (!secret) {
            response.statusCode = 503;
            response.end(JSON.stringify({ error: "QR_SECRET is not configured in .env" }));
            return;
          }
          if (typeof token !== "string" || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
            throw new Error("Invalid signed QR format");
          }
          const [payload, signature] = token.split(".");
          const expected = createHmac("sha256", secret).update(payload).digest("base64url");
          const encoder = new TextEncoder();
          const valid = signature.length === expected.length &&
            timingSafeEqual(encoder.encode(signature), encoder.encode(expected));
          response.end(JSON.stringify({ valid }));
        } catch {
          response.statusCode = 400;
          response.end(JSON.stringify({ error: "Invalid QR verification request" }));
        }
      });
    },
  }],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    proxy: {
      "^/__dev/bodydot-api/api/bodydot$": {
        target: loadEnv(mode, process.cwd(), "VITE_").VITE_API_BASE_URL?.trim().replace(/\/+$/u, "") || undefined,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__dev\/bodydot-api/, ""),
      },
    },
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
