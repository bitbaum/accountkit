import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// 0.26.0 wrote better-auth's own BetterFetch type into this declaration. A
// product whose better-auth resolved another @better-fetch/fetch then could
// not pass authClientPlugins() to createAuthClient (BiasLens's typecheck
// failed). The published types name no better-fetch internals.
test("the client declaration names no better-fetch type", () => {
  const declaration = readFileSync(
    new URL("../dist/auth/client.d.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(declaration, /BetterFetch|@better-fetch/);
});
