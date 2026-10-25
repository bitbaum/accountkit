import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { pushSchema } from "drizzle-kit/api";
import { createAuthInstance } from "../dist/auth/server.js";
import { signInMethods } from "../dist/auth/index.js";
import * as schema from "../dist/auth/schema.js";

test("recovery is advertised only when email can actually be delivered", () => {
  assert.equal(
    signInMethods({ NODE_ENV: "production" }, false).passwordReset,
    false,
  );
  assert.equal(
    signInMethods({ NODE_ENV: "development" }, false).passwordReset,
    false,
  );
  assert.equal(
    signInMethods({ NODE_ENV: "production" }, true).passwordReset,
    true,
  );
});

test("password recovery hides account existence, consumes tokens and revokes old sessions", async () => {
  const pg = new PGlite();
  try {
    const db = drizzle(pg, { schema: schema.authSchema });
    await (await pushSchema(schema.authSchema, db)).apply();
    const site = {
      url: "https://app.example.ch",
      title: "Example",
      slug: "recovery",
    };
    const env = {
      NODE_ENV: "test",
      BETTER_AUTH_SECRET:
        "test-secret-for-recovery-which-is-at-least-32-characters",
    };
    const sent = [];
    const mail = {
      configured: false,
      send: async (kind, to, url) => {
        sent.push({ kind, to, url });
      },
    };
    // Create the existing account first; switching on mail must not discard it.
    const initial = createAuthInstance({ site, database: db, mail, env });
    const request = (auth, path, body) =>
      auth.handler(
        new Request(site.url + "/api/auth" + path, {
          method: "POST",
          headers: { "content-type": "application/json", origin: site.url },
          body: JSON.stringify(body),
        }),
      );
    const original = await request(initial, "/sign-up/email", {
      email: "ada@example.ch",
      password: "original long password",
      name: "Ada",
    });
    assert.equal(original.status, 200);
    assert.equal(
      (
        await request(initial, "/request-password-reset", {
          email: "ada@example.ch",
          redirectTo: site.url + "/sign-in",
        })
      ).status,
      400,
    );
    assert.equal(
      sent.length,
      0,
      "no sender means recovery is disabled server-side too",
    );
    const oldCookie = original.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    mail.configured = true;
    const auth = createAuthInstance({ site, database: db, mail, env });
    const redirectTo = site.url + "/de/sign-in?next=%2Fde%2Faccount";
    assert.equal(
      (
        await request(auth, "/request-password-reset", {
          email: "ada@example.ch",
          redirectTo: "https://attacker.example/reset",
        })
      ).status,
      403,
    );
    const absent = await request(auth, "/request-password-reset", {
      email: "absent@example.ch",
      redirectTo,
    });
    const existing = await request(auth, "/request-password-reset", {
      email: "ada@example.ch",
      redirectTo,
    });
    assert.equal(existing.status, absent.status);
    assert.deepEqual(await existing.json(), await absent.json());
    assert.equal(sent.length, 1);
    assert.equal(sent[0].kind, "reset");
    const callback = await auth.handler(new Request(sent[0].url));
    const location = new URL(callback.headers.get("location"));
    assert.equal(location.pathname, "/de/sign-in");
    assert.equal(location.searchParams.get("next"), "/de/account");
    const token = location.searchParams.get("token");
    assert.ok(token);
    const reset = await request(auth, "/reset-password", {
      token,
      newPassword: "replacement long password",
    });
    assert.equal(reset.status, 200);
    assert.equal(
      (
        await request(auth, "/reset-password", {
          token,
          newPassword: "another long password",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(auth, "/reset-password", {
          token: "invalid-token",
          newPassword: "another long password",
        })
      ).status,
      400,
    );
    const session = await auth.handler(
      new Request(site.url + "/api/auth/get-session", {
        headers: { cookie: oldCookie },
      }),
    );
    assert.equal(await session.json(), null);
    assert.equal(
      (
        await request(initial, "/sign-in/email", {
          email: "ada@example.ch",
          password: "original long password",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request(initial, "/sign-in/email", {
          email: "ada@example.ch",
          password: "replacement long password",
        })
      ).status,
      200,
    );
    await request(auth, "/request-password-reset", {
      email: "ada@example.ch",
      redirectTo,
    });
    const expiredMail = sent.at(-1);
    const expiredToken = new URL(expiredMail.url).pathname.split("/").at(-1);
    await pg.exec(
      "UPDATE verifications SET expires_at = now() - interval '1 minute' WHERE identifier LIKE 'reset-password:%'",
    );
    const expiredCallback = await auth.handler(new Request(expiredMail.url));
    assert.equal(
      new URL(expiredCallback.headers.get("location")).searchParams.get(
        "error",
      ),
      "INVALID_TOKEN",
    );
    assert.equal(
      (
        await request(auth, "/reset-password", {
          token: expiredToken,
          newPassword: "expired long password",
        })
      ).status,
      400,
    );
  } finally {
    await pg.close();
  }
});
