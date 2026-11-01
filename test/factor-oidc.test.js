import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { pushSchema } from "drizzle-kit/api";
import { createAuthInstance } from "../dist/auth/server.js";
import * as schema from "../dist/auth/schema.js";
import { otpForURI } from "./totp-helper.js";
import { oidcFixture } from "./oidc-fixture.js";

test("verified OrangeCat OIDC callbacks preserve identity and require an enabled second factor", async () => {
  const pg = new PGlite();
  const site = {
    url: "https://oidc-app.example.test",
    title: "OIDC fixture",
    slug: "oidc-factor",
  };
  const fixture = oidcFixture({
    extraClaims: {
      preferred_username: "@Fixture",
      role: "admin",
      email: "provider-mail@example.test",
      email_verified: true,
    },
  });
  fixture.install();
  try {
    const db = drizzle(pg, { schema: schema.authSchema });
    await (await pushSchema(schema.authSchema, db)).apply();
    const auth = createAuthInstance({
      site,
      database: db,
      mail: { configured: false, send: async () => {} },
      env: {
        NODE_ENV: "test",
        BETTER_AUTH_SECRET:
          "synthetic-oidc-factor-fixture-secret-with-more-than-32-characters",
        ORANGECAT_OAUTH_ISSUER: fixture.issuer,
        ORANGECAT_OAUTH_CLIENT_ID: fixture.clientId,
        ORANGECAT_OAUTH_CLIENT_SECRET: fixture.clientSecret,
      },
    });
    const cookies = new Map();
    const call = async (path, body) => {
      const response = await auth.handler(
        new Request(new URL(path, site.url), {
          method: body === undefined ? "GET" : "POST",
          headers: {
            origin: site.url,
            "content-type": "application/json",
            cookie: [...cookies]
              .map(([key, value]) => `${key}=${value}`)
              .join("; "),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
      for (const header of response.headers.getSetCookie()) {
        const pair = header.split(";")[0],
          at = pair.indexOf("=");
        cookies.set(pair.slice(0, at), pair.slice(at + 1));
      }
      return response;
    };
    const post = (path, body = {}) => call("/api/auth" + path, body);
    const session = () =>
      call("/api/auth/get-session").then((response) => response.json());
    const callback = async () => {
      const started = await post("/sign-in/social", {
        provider: "orangecat",
        callbackURL: "/de/account",
        errorCallbackURL: "/de/sign-in?error=oidc",
      });
      assert.equal(started.status, 200);
      const authorization = new URL((await started.json()).url);
      assert.equal(
        authorization.searchParams.get("code_challenge_method"),
        "S256",
      );
      const target = fixture.approve(authorization);
      return call(target.href);
    };
    assert.equal((await callback()).status, 302);
    const original = await session();
    assert.ok(original?.user?.id, "verified provider callback signs in");
    assert.notEqual(
      original.user.email,
      "provider-mail@example.test",
      "provider address does not merge account identity",
    );
    assert.notEqual(
      original.user.role,
      "admin",
      "provider profile claims cannot grant local administrator authority",
    );
    const enabled = await post("/two-factor/enable");
    assert.equal(
      enabled.status,
      200,
      "passwordless account can enroll a fresh second factor",
    );
    const setup = await enabled.json();
    assert.equal(
      (
        await post("/two-factor/verify-totp", {
          code: otpForURI(setup.totpURI),
        })
      ).status,
      200,
    );
    await post("/sign-out");
    const challenged = await callback();
    assert.equal(challenged.status, 302);
    const target = new URL(challenged.headers.get("location"));
    assert.equal(target.pathname, "/de/sign-in");
    assert.equal(target.searchParams.get("twoFactor"), "1");
    assert.equal(target.searchParams.get("next"), "/de/account");
    assert.ok(
      (await session()) === null,
      "provider callback cannot skip the local second factor",
    );
    assert.equal(
      (
        await post("/two-factor/verify-totp", {
          code: otpForURI(setup.totpURI),
        })
      ).status,
      200,
    );
    assert.ok(
      (await session())?.user.id === original.user.id,
      "OIDC subject stays linked to the same account",
    );
    assert.equal(fixture.state.tokenExchanges, 2);
  } finally {
    fixture.restore();
    await pg.close();
  }
});
