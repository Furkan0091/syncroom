import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // 5173 is often taken by other local stacks (vite default).
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:4100",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "ws://localhost:4100",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
