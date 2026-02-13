import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const proxyTarget = "http://127.0.0.1:18765";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5174,
    proxy: {
      "/api": {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
});
