import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign, createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { pushSchema } from "drizzle-kit/api";
import { createAuthInstance } from "../dist/auth/server.js";
import * as schema from "../dist/auth/schema.js";
import { otpForURI } from "./totp-helper.js";

test("verified OrangeCat OIDC callbacks preserve identity and require an enabled second factor", async () => {
  const pg = new PGlite();
  const realFetch = globalThis.fetch;
  const issuer = "https://oidc-fixture.example.test";
  const site = {
    url: "https://oidc-app.example.test",
    title: "OIDC fixture",
    slug: "oidc-factor",
  };
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid: "fixture-key",
    alg: "RS256",
    use: "sig",
  };
  let authorization;
  let tokenExchanges = 0;
  const claims = () => ({
    iss: issuer,
    aud: "fixture-client",
    sub: "fixture-person",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
    nonce: authorization?.searchParams.get("nonce") ?? undefined,
    preferred_username: "@Fixture",
    role: "admin",
    email: "provider-mail@example.test",
    email_verified: true,
  });
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== issuer) return realFetch(input, init);
    if (url.pathname === "/.well-known/openid-configuration")
      return Response.json({
        issuer,
        authorization_endpoint: issuer + "/authorize",
        token_endpoint: issuer + "/token",
        jwks_uri: issuer + "/jwks",
        userinfo_endpoint: issuer + "/userinfo",
        response_types_supported: ["code"],
        id_token_signing_alg_values_supported: ["RS256"],
        token_endpoint_auth_methods_supported: ["client_secret_post"],
        code_challenge_methods_supported: ["S256"],
      });
    if (url.pathname === "/jwks") return Response.json({ keys: [jwk] });
    if (url.pathname === "/userinfo") return Response.json(claims());
    if (url.pathname === "/token") {
      const body = new URLSearchParams(
        init?.body ?? (input instanceof Request ? await input.text() : ""),
      );
      assert.equal(body.get("client_id"), "fixture-client");
      assert.ok(
        body.get("client_secret") === "synthetic-oidc-fixture-secret",
        "client_secret_post is used",
      );
      assert.equal(
        createHash("sha256")
          .update(body.get("code_verifier"))
          .digest("base64url"),
        authorization.searchParams.get("code_challenge"),
        "real token exchange proves PKCE possession",
      );
      tokenExchanges++;
      const header = Buffer.from(
        JSON.stringify({ alg: "RS256", typ: "JWT", kid: jwk.kid }),
      ).toString("base64url");
      const payload = Buffer.from(JSON.stringify(claims())).toString(
        "base64url",
      );
      const content = header + "." + payload;
      const signature = createSign("RSA-SHA256")
        .update(content)
        .sign(privateKey)
        .toString("base64url");
      return Response.json({
        access_token: "synthetic-access-token",
        token_type: "Bearer",
        expires_in: 300,
        id_token: content + "." + signature,
      });
    }
    return new Response(null, { status: 404 });
  };
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
        ORANGECAT_OAUTH_ISSUER: issuer,
        ORANGECAT_OAUTH_CLIENT_ID: "fixture-client",
        ORANGECAT_OAUTH_CLIENT_SECRET: "synthetic-oidc-fixture-secret",
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
      authorization = new URL((await started.json()).url);
      assert.equal(authorization.origin, issuer);
      assert.equal(
        authorization.searchParams.get("code_challenge_method"),
        "S256",
      );
      const target = new URL(authorization.searchParams.get("redirect_uri"));
      target.searchParams.set("code", "synthetic-authorization-code");
      target.searchParams.set("state", authorization.searchParams.get("state"));
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
    assert.equal(tokenExchanges, 2);
  } finally {
    globalThis.fetch = realFetch;
    await pg.close();
  }
});
