import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  base: "./",
  resolve: {
    alias: mode === "test" ? {} : {
      "node:fs": fileURLToPath(new URL("./src/browser-fs.ts", import.meta.url)),
    },
  },
}));
