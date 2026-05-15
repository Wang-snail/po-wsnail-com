import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: "public/react-workbench",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: "src/react-workbench/main.jsx",
      output: {
        entryFileNames: "workbench.js",
        chunkFileNames: "workbench-[name].js",
        assetFileNames: assetInfo => assetInfo.name?.endsWith(".css") ? "workbench.css" : "workbench-[name][extname]"
      }
    }
  }
});
