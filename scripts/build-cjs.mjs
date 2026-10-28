// CommonJS copies of the entries a CommonJS backend needs. ./auth/password is
// two constants and one function with no imports; ./auth/hash imports only
// node:crypto. Both come from the same src files as the ESM build, so the
// copies cannot differ from it.
import { copyFileSync } from "node:fs";
import { build } from "esbuild";

for (const name of ["password", "hash"]) {
  await build({
    entryPoints: [`src/auth/${name}.ts`],
    outfile: `dist/auth/${name}.cjs`,
    format: "cjs",
    platform: "node",
    target: "es2022",
    logLevel: "warning",
  });
  copyFileSync(`dist/auth/${name}.d.ts`, `dist/auth/${name}.d.cts`);
}
