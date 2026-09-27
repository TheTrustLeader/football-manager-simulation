import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      "node:fs": fileURLToPath(new URL("./src/browser-fs.ts", import.meta.url)),
    },
  },
});
