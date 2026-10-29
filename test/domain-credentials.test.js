import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { pushSchema } from "drizzle-kit/api";
import { createAuthInstance } from "@bitbaum/accountkit/auth/server";
import { authSchema } from "@bitbaum/accountkit/auth/schema";
import { authBucket } from "../dist/auth/limits.js";

test("domain proof uses revocable shared sessions and cannot skip restrictions or MFA", async () => {
  const pg = new PGlite();
  try {
    const db = drizzle(pg, { schema: authSchema });
    await (await pushSchema(authSchema, db)).apply();
    await db.insert(authSchema.user).values({
      id: "stable-domain-account",
      email: "domain@example.test",
      name: "",
    });
    const site = {
      url: "https://domain.example.test",
      title: "Domain",
      slug: "domain",
    };
    const options = {
      site,
      database: db,
      mail: { configured: false, send: async () => {} },
      env: {
        NODE_ENV: "test",
        BETTER_AUTH_SECRET:
          "synthetic-domain-credential-secret-at-least-32-characters",
      },
    };
    const bindings = [];
    let failBinding = false;
    const domainCredentials = {
      verify: async (credential) =>
        credential === "valid-domain-proof"
          ? {
              userId: "stable-domain-account",
              bindSession: async (sessionId) => {
                if (failBinding) throw new Error("domain context unavailable");
                bindings.push(sessionId);
              },
            }
          : credential === "missing-user-proof"
            ? { userId: "missing-user" }
            : null,
    };
    const auth = createAuthInstance({ ...options, domainCredentials });
    const post = (instance, credential, origin = site.url) =>
      instance.handler(
        new Request(site.url + "/api/auth/sign-in/domain", {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify({ credential }),
        }),
      );
    const cookie = (r) =>
      r.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
    const session = async (cookies) =>
      (
        await auth.handler(
          new Request(site.url + "/api/auth/get-session", {
            headers: { cookie: cookies },
          }),
        )
      ).json();
    assert.equal(authBucket("/sign-in/domain"), "credential");
    assert.equal(
      (await post(createAuthInstance(options), "valid-domain-proof")).status,
      404,
      "domain login is opt-in",
    );
    for (const proof of ["invalid-proof", "missing-user-proof"]) {
      const response = await post(auth, proof);
      assert.equal(response.status, 401);
      assert.equal(cookie(response), "");
    }
    assert.equal((await post(auth, "")).status, 400);
    assert.equal(
      (await post(auth, "valid-domain-proof", "https://foreign.example.test"))
        .status,
      403,
    );
    failBinding = true;
    const failed = await post(auth, "valid-domain-proof");
    assert.equal(failed.status, 500);
    assert.equal(cookie(failed), "");
    assert.equal(
      (await db.select().from(authSchema.session)).length,
      0,
      "failed binding leaves no usable session",
    );
    failBinding = false;
    const signedIn = await post(auth, "valid-domain-proof");
    assert.equal(signedIn.status, 200);
    const current = await session(cookie(signedIn));
    assert.equal(current.user.id, "stable-domain-account");
    assert.deepEqual(bindings, [current.session.id]);
    for (const path of [
      "/list-sessions",
      "/two-factor/enable",
      "/passkey/generate-register-options",
      "/change-email",
    ]) {
      const response = await auth.handler(
        new Request(site.url + "/api/auth" + path, {
          method:
            path === "/list-sessions" ||
            path.includes("generate-register-options")
              ? "GET"
              : "POST",
          headers: {
            cookie: cookie(signedIn),
            origin: site.url,
            "content-type": "application/json",
          },
          ...(path === "/list-sessions" ||
          path.includes("generate-register-options")
            ? {}
            : { body: "{}" }),
        }),
      );
      assert.equal(
        response.status,
        403,
        `${path} requires a primary account proof`,
      );
    }
    const fixedExpiry = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await db
      .update(authSchema.session)
      .set({
        expiresAt: fixedExpiry,
        updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      })
      .where(eq(authSchema.session.id, current.session.id));
    await session(cookie(signedIn));
    const rows = await db
      .select()
      .from(authSchema.session)
      .where(eq(authSchema.session.id, current.session.id));
    assert.equal(
      rows[0].expiresAt.getTime(),
      fixedExpiry.getTime(),
      "sliding refresh cannot outlive the domain restriction",
    );
    await db.insert(authSchema.account).values({
      id: "existing-credential",
      userId: current.user.id,
      accountId: current.user.id,
      providerId: "credential",
      password: await hashPassword("synthetic primary credential"),
    });
    const primary = await auth.handler(
      new Request(site.url + "/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          cookie: cookie(signedIn),
          origin: site.url,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "domain@example.test",
          password: "synthetic primary credential",
        }),
      }),
    );
    assert.equal(primary.status, 200);
    assert.equal(
      (
        await auth.handler(
          new Request(site.url + "/api/auth/list-sessions", {
            headers: { cookie: cookie(primary) },
          }),
        )
      ).status,
      200,
      "password authentication grants account management without lifting the old domain session",
    );
    await db
      .delete(authSchema.session)
      .where(eq(authSchema.session.userId, current.user.id));
    assert.equal(
      await session(cookie(signedIn)),
      null,
      "database revocation is immediate",
    );
    await db
      .update(authSchema.user)
      .set({ twoFactorEnabled: true })
      .where(eq(authSchema.user.id, current.user.id));
    const factor = await post(auth, "valid-domain-proof");
    assert.equal(factor.status, 403);
    assert.equal(
      (await factor.json()).code,
      "DOMAIN_CREDENTIAL_REQUIRES_ANOTHER_METHOD",
    );
    assert.equal(cookie(factor), "");
    assert.equal((await db.select().from(authSchema.session)).length, 0);
  } finally {
    await pg.close();
  }
});
