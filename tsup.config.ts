import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    platform: "browser",
  },
  {
    entry: ["src/index.ts"],
    format: ["cjs"],
    platform: "node",
  },
]);
