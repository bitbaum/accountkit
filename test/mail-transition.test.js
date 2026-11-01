import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { pushSchema } from "drizzle-kit/api";
import { createAuthInstance } from "../dist/auth/server.js";
import * as schema from "../dist/auth/schema.js";

test("with confirmation required, existing password accounts confirm their address after mail is enabled without changing identity", async () => {
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
    const enabled = createAuthInstance({
      site,
      env,
      database: db,
      mail,
      emailConfirmation: "before-sign-in",
    });
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

test("by default, mail sends a confirmation link but nobody waits for it", async () => {
  const pg = new PGlite();
  try {
    const db = drizzle(pg, { schema: schema.authSchema });
    await (await pushSchema(schema.authSchema, db)).apply();
    const site = { url: "https://example.ch", title: "Example", slug: "open" };
    const env = {
      NODE_ENV: "test",
      BETTER_AUTH_SECRET:
        "synthetic-open-door-secret-with-more-than-32-characters",
    };
    const sent = [];
    const mail = {
      configured: false,
      send: async (kind, to, url) => sent.push({ kind, to, url }),
    };
    const post = (auth, path, body) =>
      auth.handler(
        new Request(site.url + "/api/auth" + path, {
          method: "POST",
          headers: { "content-type": "application/json", origin: site.url },
          body: JSON.stringify(body),
        }),
      );
    // An account made before mail existed, never confirmed.
    const before = {
      email: "earlier@example.ch",
      password: "earlier long password",
    };
    const old = createAuthInstance({ site, env, database: db, mail });
    assert.equal(
      (await post(old, "/sign-up/email", { ...before, name: "" })).status,
      200,
    );

    mail.configured = true;
    const auth = createAuthInstance({ site, env, database: db, mail });
    // It still signs in, unconfirmed.
    const login = await post(auth, "/sign-in/email", before);
    assert.equal(login.status, 200);
    assert.equal((await login.json()).user.emailVerified, false);

    // A new sign-up is signed in at once, and its link is in the mail.
    const fresh = { email: "new@example.ch", password: "new long password" };
    const signup = await post(auth, "/sign-up/email", { ...fresh, name: "" });
    assert.equal(signup.status, 200);
    assert.ok(
      signup.headers.getSetCookie().some((c) => c.includes("session_token")),
    );
    assert.deepEqual(
      sent.map(({ kind, to }) => [kind, to]),
      [["verify", fresh.email]],
    );

    // Following the link later confirms the address.
    await auth.handler(new Request(sent[0].url));
    const again = await post(auth, "/sign-in/email", fresh);
    assert.equal((await again.json()).user.emailVerified, true);
  } finally {
    await pg.close();
  }
});
