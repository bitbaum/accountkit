import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { pushSchema } from "drizzle-kit/api";
import { createAuthInstance } from "../dist/auth/server.js";
import * as schema from "../dist/auth/schema.js";

test("existing password accounts can confirm their address after mail is enabled without changing identity", async () => {
  const pg = new PGlite();
  try {
    const db = drizzle(pg, { schema: schema.authSchema });
    await (await pushSchema(schema.authSchema, db)).apply();
    const site = {
      url: "https://example.ch",
      title: "Example",
      slug: "transition",
    };
    const env = {
      NODE_ENV: "test",
      BETTER_AUTH_SECRET:
        "synthetic-transition-secret-with-more-than-32-characters",
    };
    const sent = [];
    const mail = {
      configured: false,
      send: async (kind, to, url) => {
        sent.push({ kind, to, url });
      },
    };
    const post = (auth, path, body) =>
      auth.handler(
        new Request(site.url + "/api/auth" + path, {
          method: "POST",
          headers: { "content-type": "application/json", origin: site.url },
          body: JSON.stringify(body),
        }),
      );
    const credentials = {
      email: "existing@example.ch",
      password: "existing long password",
    };
    const initial = createAuthInstance({ site, env, database: db, mail });
    const signup = await post(initial, "/sign-up/email", {
      ...credentials,
      name: "Existing",
    });
    assert.equal(signup.status, 200);
    const original = (await signup.json()).user;
    assert.equal(original.emailVerified, false);
    assert.equal(sent.length, 0);

    mail.configured = true;
    const enabled = createAuthInstance({ site, env, database: db, mail });
    const blocked = await post(enabled, "/sign-in/email", credentials);
    assert.equal(blocked.status, 403);
    assert.equal((await blocked.json()).code, "EMAIL_NOT_VERIFIED");
    const resent = await post(enabled, "/send-verification-email", {
      email: credentials.email,
      callbackURL: "/account",
    });
    assert.equal(resent.status, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].kind, "verify");
    const confirmed = await enabled.handler(new Request(sent[0].url));
    assert.equal(confirmed.status, 302);
    assert.equal(
      new URL(confirmed.headers.get("location"), site.url).pathname,
      "/account",
    );
    const login = await post(enabled, "/sign-in/email", credentials);
    assert.equal(login.status, 200);
    const user = (await login.json()).user;
    assert.equal(user.id, original.id);
    assert.equal(user.emailVerified, true);
    assert.equal(user.role, "customer");
  } finally {
    await pg.close();
  }
});
