// A synthetic OIDC issuer for tests: discovery, JWKS, userinfo and a token
// endpoint that checks client_secret_post and PKCE before signing an id_token.
// `install()` routes the issuer's origin through it; everything else still
// reaches the real fetch. `restore()` puts the real fetch back.
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign, createHash } from "node:crypto";

export function oidcFixture({
  issuer = "https://oidc-fixture.example.test",
  clientId = "fixture-client",
  clientSecret = "synthetic-oidc-fixture-secret",
  subject = "fixture-person",
  extraClaims = {},
} = {}) {
  const realFetch = globalThis.fetch;
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid: "fixture-key",
    alg: "RS256",
    use: "sig",
  };
  const state = { authorization: null, tokenExchanges: 0 };
  const claims = () => ({
    iss: issuer,
    aud: clientId,
    sub: subject,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
    nonce: state.authorization?.searchParams.get("nonce") ?? undefined,
    ...extraClaims,
  });
  const fake = async (input, init) => {
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
      assert.equal(body.get("client_id"), clientId);
      assert.ok(
        body.get("client_secret") === clientSecret,
        "client_secret_post is used",
      );
      assert.equal(
        createHash("sha256")
          .update(body.get("code_verifier"))
          .digest("base64url"),
        state.authorization.searchParams.get("code_challenge"),
        "real token exchange proves PKCE possession",
      );
      assert.equal(
        body.get("redirect_uri"),
        state.authorization.searchParams.get("redirect_uri"),
        "the token exchange names the redirect the authorization used",
      );
      state.tokenExchanges++;
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
  return {
    issuer,
    clientId,
    clientSecret,
    state,
    install: () => {
      globalThis.fetch = fake;
    },
    restore: () => {
      globalThis.fetch = realFetch;
    },
    /**
     * The provider's answer to an authorization URL: its redirect back with a
     * code and the same state. Records the URL for the token check.
     */
    approve: (authorizationUrl) => {
      state.authorization = new URL(authorizationUrl);
      assert.equal(state.authorization.origin, issuer);
      const target = new URL(
        state.authorization.searchParams.get("redirect_uri"),
      );
      target.searchParams.set("code", "synthetic-authorization-code");
      target.searchParams.set(
        "state",
        state.authorization.searchParams.get("state"),
      );
      return target;
    },
  };
}
