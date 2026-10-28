// A CommonJS copy of ./auth/password, for backends that still `require` (the
// one password rule is two constants and one function, with no imports, so the
// copy cannot differ from the ESM build: both come from src/auth/password.ts).
import { copyFileSync } from "node:fs";
import { build } from "esbuild";

await build({
  entryPoints: ["src/auth/password.ts"],
  outfile: "dist/auth/password.cjs",
  format: "cjs",
  platform: "neutral",
  target: "es2022",
  logLevel: "warning",
});
copyFileSync("dist/auth/password.d.ts", "dist/auth/password.d.cts");
