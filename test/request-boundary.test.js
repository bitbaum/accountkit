import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuthRuntime } from "../dist/auth/next.js";

test("unconfigured sessions still require a request and do not swallow Next's render signal", async () => {
  let databaseCalls = 0;
  const runtime = createAuthRuntime({
    site: { url: "https://example.ch", title: "Example", slug: "example" },
    mail: { configured: false, send: async () => {} },
    isDatabaseConfigured: () => false,
    getDatabase: () => {
      databaseCalls++;
      throw new Error("must not construct a database");
    },
  });
  // Outside a Next request, headers() raises the same boundary the framework
  // uses to avoid pre-rendering a request-dependent page. The old early return
  // resolved null, so a build cached Heidi's anonymous account redirect.
  await assert.rejects(runtime.getSession(), /outside a request scope/);
  assert.equal(databaseCalls, 0);
});
