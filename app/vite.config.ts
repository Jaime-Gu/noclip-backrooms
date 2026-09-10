import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

// Single-file build: everything inlined into dist/index.html so the site
// works from file:// (double-click) with zero external requests.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  server: {
    port: 3000,
  },
  build: {
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 100000,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
