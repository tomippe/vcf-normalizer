import { defineConfig } from "vite";

export default defineConfig({
  base: "/vcf-normalizer/",
  server: {
    host: true,
    port: 5180,
  },
  build: {
    outDir: "build",
    emptyOutDir: true,
  },
});
