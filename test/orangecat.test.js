// The OrangeCat sign-in contract. Every test here is a failure one of the nine
// apps shipped, or paid a debugging cycle to avoid. If one goes red, read its
// comment before "fixing" the test.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ORANGECAT_IDENTITY_SCOPES,
  applyOcRefresh,
  authorizationParams,
  bindOcTokens,
  contactEmailFor,
  decideOrangecatSignIn,
  emailEarnsPromotion,
  isPlaceholderEmail,
  mayReceivePasswordReset,
  mintLinkToken,
  ocRefreshDue,
  orangecatClient,
  orangecatProfile,
  orangecatProvider,
  orangecatProviderV4,
  placeholderEmail,
  readLinkToken,
  refreshOcTokens,
  resolveOrangecatUser,
  returnPath,
  syncOcSession,
  withOrangecatIdentity,
} from "../dist/orangecat.js";

const NOW = 1_800_000_000;
const client = {
  clientId: "app",
  clientSecret: "s3cret",
  issuer: "https://orangecat.ch",
};
const reply =
  (status, body, seen = []) =>
  async (url, init) => {
    seen.push([String(url), init ?? {}]);
    return new Response(
      typeof body === "string" ? body : JSON.stringify(body),
      { status },
    );
  };

describe("provider", () => {
  for (const [name, make] of [
    ["v5", orangecatProvider],
    ["v4", orangecatProviderV4],
  ]) {
    // OrangeCat's token endpoint accepts ONLY client_secret_post; the Auth.js
    // default (basic) is refused with a 400 that reads "client_id is required".
    test(`${name}: authenticates with client_secret_post`, () => {
      const p = make(client);
      assert.equal(p.client.token_endpoint_auth_method, "client_secret_post");
    });

    // PKCE is required even for a confidential client.
    test(`${name}: checks pkce and state`, () => {
      const p = make(client);
      assert.deepEqual([...p.checks].sort(), ["pkce", "state"]);
    });

    test(`${name}: asks for identity only unless told otherwise`, () => {
      assert.equal(
        make(client).authorization.params.scope,
        "openid profile email",
      );
      assert.equal(
        make({ ...client, scopes: "openid profile" }).authorization.params
          .scope,
        "openid profile",
      );
    });

    test(`${name}: never links by email`, () => {
      const p = make(client);
      assert.equal(p.allowDangerousEmailAccountLinking, false);
      assert.equal(
        p.id,
        "orangecat",
        "OrangeCat registered /api/auth/callback/orangecat",
      );
      const user = p.profile({ sub: "a1", email: "victim@example.com" });
      assert.ok(!("email" in user), "profile() must not carry email");
    });
  }

  test("v4 discovers OrangeCat's endpoints from the issuer", () => {
    const p = orangecatProviderV4({
      ...client,
      issuer: "https://orangecat.ch/",
    });
    assert.equal(
      p.wellKnown,
      "https://orangecat.ch/.well-known/openid-configuration",
    );
    assert.equal(p.idToken, true);
  });

  test("the client is absent, not half-configured, without both halves", () => {
    assert.equal(orangecatClient({ ORANGECAT_OAUTH_CLIENT_ID: "x" }), null);
    assert.equal(orangecatClient({ ORANGECAT_OAUTH_CLIENT_SECRET: "y" }), null);
    assert.deepEqual(
      orangecatClient({
        ORANGECAT_OAUTH_CLIENT_ID: "x",
        ORANGECAT_OAUTH_CLIENT_SECRET: "y",
      }),
      { clientId: "x", clientSecret: "y", issuer: "https://orangecat.ch" },
    );
  });
});

describe("profile", () => {
  // Auth.js looks a new account up by user.email and either links it
  // (takeover: OrangeCat auto-confirms addresses) or refuses the sign-in.
  test("has no email key — the address is contact data only", () => {
    const user = orangecatProfile({
      sub: "a1",
      name: "Cato",
      email: " Cato@Example.COM ",
      picture: "https://x/a.png",
      preferred_username: "@cato",
    });
    assert.ok(!("email" in user));
    assert.deepEqual(user, {
      id: "a1",
      name: "Cato",
      image: "https://x/a.png",
      orangecatSub: "a1",
      username: "cato",
      contactEmail: "cato@example.com",
    });
  });

  test("the id is the sub — an id_token without one is refused", () => {
    assert.throws(() => orangecatProfile({ email: "a@b.c" }), /no sub/);
  });

  test("falls back to the handle for a name, never to the email", () => {
    assert.equal(
      orangecatProfile({ sub: "a", preferred_username: "cat" }).name,
      "cat",
    );
    assert.equal(
      orangecatProfile({ sub: "a", email: "first.last@x.ch" }).name,
      null,
    );
  });

  test("the identity scope constant is what the providers send", () => {
    assert.equal(ORANGECAT_IDENTITY_SCOPES, "openid profile email");
  });
});

describe("session refresh", () => {
  test("binds what OrangeCat handed over at sign-in", () => {
    assert.deepEqual(
      bindOcTokens(
        { actorId: "a1", ocRetryAt: 5 },
        { refresh_token: "r1", expires_at: NOW + 3600 },
      ),
      { actorId: "a1", ocRefreshToken: "r1", ocExpiresAt: NOW + 3600 },
    );
  });

  test("trusts a valid access token, refreshes once it has (nearly) expired", () => {
    const t = { actorId: "a1", ocRefreshToken: "r1", ocExpiresAt: NOW + 3600 };
    assert.equal(ocRefreshDue(t, NOW), false);
    assert.equal(ocRefreshDue(t, NOW + 3540), true);
    assert.equal(
      ocRefreshDue({ ...t, ocRetryAt: NOW + 4000 }, NOW + 3700),
      false,
    );
    assert.equal(ocRefreshDue({ actorId: "a1" }, NOW), false);
  });

  test("the refresh grant authenticates with client_secret_post", async () => {
    const seen = [];
    await refreshOcTokens("r1", {
      ...client,
      issuer: "https://orangecat.ch/",
      fetch: reply(200, { expires_in: 3600 }, seen),
      nowSeconds: NOW,
    });
    const [url, init] = seen[0];
    assert.equal(url, "https://orangecat.ch/oauth/token");
    assert.equal(init.headers.authorization, undefined, "no basic auth header");
    const body = new URLSearchParams(String(init.body));
    assert.equal(body.get("grant_type"), "refresh_token");
    assert.equal(body.get("client_id"), "app");
    assert.equal(body.get("client_secret"), "s3cret");
  });

  // orangecat#1212: confidential clients keep the same refresh token.
  test("keeps the refresh token when none comes back, takes a rotated one", async () => {
    const deps = (body) => ({
      ...client,
      fetch: reply(200, body),
      nowSeconds: NOW,
    });
    assert.deepEqual(await refreshOcTokens("r1", deps({ expires_in: 3600 })), {
      ok: true,
      refreshToken: "r1",
      expiresAt: NOW + 3600,
    });
    const rotated = await refreshOcTokens(
      "r1",
      deps({ expires_in: 60, refresh_token: "r2" }),
    );
    assert.equal(rotated.ok && rotated.refreshToken, "r2");
  });

  // Disconnect on OrangeCat, Sign out everywhere, account deleted: the
  // session must end, not live on until the cookie expires.
  test("invalid_grant ends the session", async () => {
    const token = {
      actorId: "a1",
      ocRefreshToken: "r1",
      ocExpiresAt: NOW - 10,
      name: "Cato",
    };
    const out = await syncOcSession({ token }, client, {
      fetch: reply(400, { error: "invalid_grant" }),
      nowSeconds: NOW,
    });
    assert.equal(out.actorId, undefined, "signed out");
    assert.equal(out.ocRefreshToken, undefined);
  });

  // An OrangeCat outage must not sign everyone out of every app.
  test("anything else keeps the session and retries in 60 s", async () => {
    for (const fetch of [
      reply(503, "<html>down</html>"),
      reply(400, { error: "invalid_request" }),
      async () => {
        throw new Error("ECONNRESET");
      },
    ]) {
      const token = {
        actorId: "a1",
        ocRefreshToken: "r1",
        ocExpiresAt: NOW - 10,
      };
      const out = await syncOcSession({ token }, client, {
        fetch,
        nowSeconds: NOW,
      });
      assert.equal(out.actorId, "a1");
      assert.equal(out.ocRetryAt, NOW + 60);
    }
  });

  test("a success slides the expiry and clears a held retry", () => {
    const t = applyOcRefresh(
      { actorId: "a1", ocRefreshToken: "r1", ocExpiresAt: 0, ocRetryAt: NOW },
      { ok: true, refreshToken: "r1", expiresAt: NOW + 3600 },
      NOW,
    );
    assert.deepEqual(t, {
      actorId: "a1",
      ocRefreshToken: "r1",
      ocExpiresAt: NOW + 3600,
    });
  });

  test("on sign-in: records the actor id from the sub, and the tokens", async () => {
    let called = false;
    const out = await syncOcSession(
      {
        token: { sub: "a1" },
        account: {
          provider: "orangecat",
          refresh_token: "r1",
          expires_at: NOW + 3600,
        },
        profile: { sub: "a1", email: "x@y.z" },
      },
      client,
      {
        fetch: async () => {
          called = true;
          return new Response("{}");
        },
        nowSeconds: NOW,
      },
    );
    assert.equal(called, false, "no refresh on the sign-in itself");
    assert.deepEqual(out, {
      sub: "a1",
      actorId: "a1",
      ocRefreshToken: "r1",
      ocExpiresAt: NOW + 3600,
    });
  });

  test("without a client it never calls OrangeCat", async () => {
    const token = { actorId: "a1", ocRefreshToken: "r1", ocExpiresAt: 0 };
    const out = await syncOcSession({ token }, null, {
      fetch: async () => assert.fail("called"),
      nowSeconds: NOW,
    });
    assert.equal(out.actorId, "a1");
  });
});

describe("entry", () => {
  test("sign-up opens OrangeCat on create-account; hints are checked first", () => {
    assert.deepEqual(authorizationParams({ mode: "sign-up" }), {
      prompt: "create",
    });
    assert.deepEqual(authorizationParams({ mode: "sign-in" }), {});
    assert.deepEqual(
      authorizationParams({ email: " a@b.ch ", provider: "github" }),
      {
        login_hint: "a@b.ch",
        idp_hint: "github",
      },
    );
    assert.deepEqual(
      authorizationParams({ email: "not an email", provider: "evil" }),
      {},
    );
  });

  test("returns only to a path on this site", () => {
    assert.equal(returnPath("/settings?tab=1"), "/settings?tab=1");
    for (const bad of [
      "//evil.example",
      "/\\evil.example",
      "https://evil.example",
      "",
      null,
      4,
      "/a\nb",
    ]) {
      assert.equal(returnPath(bad, "/home"), "/home", String(bad));
    }
  });
});

describe("identity rules for apps with a user table", () => {
  test("the placeholder is undeliverable and recognisable", () => {
    const p = placeholderEmail("3f2a-…/x");
    assert.equal(p, "orangecat-3f2a-x@users.invalid");
    assert.ok(isPlaceholderEmail(p));
    assert.ok(!isPlaceholderEmail("someone@users.example"));
    assert.equal(
      contactEmailFor("a1", "Taken@x.ch", true),
      "orangecat-a1@users.invalid",
    );
    assert.equal(contactEmailFor("a1", "Free@x.ch", false), "free@x.ch");
    assert.equal(
      contactEmailFor("a1", null, false),
      "orangecat-a1@users.invalid",
    );
  });

  test("an OrangeCat email never earns ADMIN_EMAILS promotion", () => {
    assert.equal(emailEarnsPromotion("orangecat"), false);
    assert.equal(emailEarnsPromotion("credentials"), true);
    assert.equal(emailEarnsPromotion(undefined), true);
  });

  test("an OrangeCat-only account gets no local password-reset email", () => {
    assert.equal(
      mayReceivePasswordReset({
        email: "a@b.ch",
        hasPassword: false,
        orangecatLinked: true,
      }),
      false,
    );
    assert.equal(
      mayReceivePasswordReset({
        email: placeholderEmail("a"),
        hasPassword: true,
        orangecatLinked: false,
      }),
      false,
    );
    assert.equal(
      mayReceivePasswordReset({
        email: "a@b.ch",
        hasPassword: true,
        orangecatLinked: true,
      }),
      true,
      "a person with their own password may reset it",
    );
    assert.equal(
      mayReceivePasswordReset({
        email: "a@b.ch",
        hasPassword: false,
        orangecatLinked: false,
      }),
      true,
      "a Google/GitHub account may set one (loki's rule)",
    );
  });

  // The takeover: register the victim's address on OrangeCat, sign in here.
  test("a new sub with a taken email creates a NEW user, never the email's owner", () => {
    const d = decideOrangecatSignIn({
      sub: "attacker",
      contactEmail: "victim@x.ch",
      byActor: null,
      linkFor: null,
      emailTaken: true,
    });
    assert.deepEqual(d, {
      kind: "create",
      email: "orangecat-attacker@users.invalid",
    });
  });

  test("evig's policy: refuse a taken email or a missing one", () => {
    const base = { sub: "s", byActor: null, linkFor: null };
    const policy = { whenEmailTaken: "refuse", whenNoEmail: "refuse" };
    assert.deepEqual(
      decideOrangecatSignIn(
        { ...base, contactEmail: "v@x.ch", emailTaken: true },
        policy,
      ),
      { kind: "refuse", reason: "email-taken" },
    );
    assert.deepEqual(
      decideOrangecatSignIn(
        { ...base, contactEmail: null, emailTaken: false },
        policy,
      ),
      {
        kind: "refuse",
        reason: "no-email",
      },
    );
  });

  test("a known sub signs in as its user; a connect from inside a session links", () => {
    assert.deepEqual(
      decideOrangecatSignIn({
        sub: "s",
        contactEmail: null,
        byActor: { id: "u1" },
        linkFor: null,
        emailTaken: false,
      }),
      { kind: "existing", userId: "u1" },
    );
    assert.deepEqual(
      decideOrangecatSignIn({
        sub: "s",
        contactEmail: null,
        byActor: null,
        linkFor: { id: "u2", orangecatSub: null },
        emailTaken: false,
      }),
      { kind: "link", userId: "u2" },
    );
    assert.deepEqual(
      decideOrangecatSignIn({
        sub: "s",
        contactEmail: null,
        byActor: { id: "u1" },
        linkFor: { id: "u2", orangecatSub: null },
        emailTaken: false,
      }),
      { kind: "refuse", reason: "already-linked" },
    );
    assert.deepEqual(
      decideOrangecatSignIn({
        sub: "s",
        contactEmail: null,
        byActor: null,
        linkFor: { id: "u2", orangecatSub: "other" },
        emailTaken: false,
      }),
      { kind: "refuse", reason: "already-linked" },
    );
  });
});

function memoryStore(rows = []) {
  const calls = [];
  return {
    rows,
    calls,
    async findBySub(sub) {
      return rows.find((r) => r.orangecatSub === sub) ?? null;
    },
    async emailTaken(email) {
      return rows.some((r) => r.email.toLowerCase() === email.toLowerCase());
    },
    async insert(row) {
      calls.push(["insert", row]);
      if (rows.some((r) => r.email === row.email))
        throw new Error("unique violation");
      const user = { id: `u${rows.length + 1}`, ...row };
      rows.push(user);
      return user;
    },
    async attachSub(userId, sub) {
      const u = rows.find((r) => r.id === userId);
      if (!u || (u.orangecatSub && u.orangecatSub !== sub)) return false;
      u.orangecatSub = sub;
      return true;
    },
  };
}

describe("adapter wrapper", () => {
  const baseAdapter = () => {
    const seen = [];
    return {
      seen,
      async getUserByAccount(ref) {
        seen.push(["getUserByAccount", ref.provider]);
        return null;
      },
      async createUser(u) {
        seen.push(["createUser", u.email]);
        return { id: "base", ...u };
      },
      async linkAccount(a) {
        seen.push(["linkAccount", a.provider]);
      },
      async getUserByEmail() {
        return null;
      },
    };
  };

  test("an OrangeCat sign-in resolves by sub; other providers pass through", async () => {
    const store = memoryStore([
      { id: "u1", orangecatSub: "s1", email: "a@x.ch" },
    ]);
    const base = baseAdapter();
    const a = withOrangecatIdentity(base, store);
    assert.equal(
      (
        await a.getUserByAccount({
          provider: "orangecat",
          providerAccountId: "s1",
        })
      ).id,
      "u1",
    );
    assert.equal(
      await a.getUserByAccount({ provider: "google", providerAccountId: "g" }),
      null,
    );
    assert.deepEqual(base.seen, [["getUserByAccount", "google"]]);
    assert.equal(
      typeof a.getUserByEmail,
      "function",
      "the rest of the adapter survives",
    );
  });

  test("createUser stores the contact email when free, the placeholder when taken", async () => {
    const store = memoryStore([
      { id: "u1", orangecatSub: null, email: "victim@x.ch" },
    ]);
    const a = withOrangecatIdentity(baseAdapter(), store);
    const user = orangecatProfile({
      sub: "s2",
      email: "VICTIM@x.ch",
      name: "Mallory",
    });
    const created = await a.createUser(user);
    assert.equal(created.email, "orangecat-s2@users.invalid");
    assert.equal(created.orangecatSub, "s2");
    const free = await a.createUser(
      orangecatProfile({ sub: "s3", email: "new@x.ch" }),
    );
    assert.equal(free.email, "new@x.ch");
  });

  test("a non-OrangeCat createUser goes to the base adapter", async () => {
    const base = baseAdapter();
    const a = withOrangecatIdentity(base, memoryStore());
    assert.equal((await a.createUser({ email: "g@x.ch" })).id, "base");
  });

  // datacat's race: the address was claimed between the check and the insert.
  test("an insert that loses a race falls back to the placeholder, or the raced row", async () => {
    const store = memoryStore();
    const insert = store.insert;
    let first = true;
    store.insert = async (row) => {
      if (first) {
        first = false;
        store.rows.push({ id: "other", orangecatSub: null, email: row.email });
        throw new Error("unique violation");
      }
      return insert.call(store, row);
    };
    const u = await resolveOrangecatUser(store, {
      sub: "s9",
      contactEmail: "late@x.ch",
    });
    assert.equal(u.email, "orangecat-s9@users.invalid");

    const store2 = memoryStore();
    store2.insert = async () => {
      store2.rows.push({ id: "same", orangecatSub: "s9", email: "late@x.ch" });
      throw new Error("unique violation");
    };
    assert.equal(
      (
        await resolveOrangecatUser(store2, {
          sub: "s9",
          contactEmail: "late@x.ch",
        })
      ).id,
      "same",
    );
  });

  test("linkAccount attaches the sub; a different sub is refused; tokens only when asked", async () => {
    const store = memoryStore([
      { id: "u1", orangecatSub: null, email: "a@x.ch" },
    ]);
    const base = baseAdapter();
    const a = withOrangecatIdentity(base, store);
    await a.linkAccount({
      provider: "orangecat",
      providerAccountId: "s1",
      userId: "u1",
    });
    assert.equal(store.rows[0].orangecatSub, "s1");
    assert.deepEqual(base.seen, [], "identity only: no accounts row");
    await assert.rejects(
      a.linkAccount({
        provider: "orangecat",
        providerAccountId: "s2",
        userId: "u1",
      }),
      /different OrangeCat login/,
    );

    const keeping = withOrangecatIdentity(base, store, { keepTokens: true });
    await keeping.linkAccount({
      provider: "orangecat",
      providerAccountId: "s1",
      userId: "u1",
    });
    assert.deepEqual(base.seen, [["linkAccount", "orangecat"]]);
  });
});

describe("link token", () => {
  const secret = "auth-secret";
  test("round-trips for ten minutes, then expires", () => {
    const t = mintLinkToken("user-1", secret, NOW * 1000);
    assert.equal(readLinkToken(t, secret, NOW * 1000), "user-1");
    assert.equal(readLinkToken(t, secret, (NOW + 599) * 1000), "user-1");
    assert.equal(readLinkToken(t, secret, (NOW + 601) * 1000), null);
  });

  test("a forged, altered or foreign token is nobody", () => {
    const t = mintLinkToken("user-1", secret, NOW * 1000);
    const [, exp, sig] = t.split(".");
    assert.equal(
      readLinkToken(`user-2.${exp}.${sig}`, secret, NOW * 1000),
      null,
    );
    assert.equal(readLinkToken(t, "other-secret", NOW * 1000), null);
    assert.equal(readLinkToken("garbage", secret, NOW * 1000), null);
    assert.equal(readLinkToken(t, "", NOW * 1000), null);
    assert.throws(() => mintLinkToken("a.b", secret));
  });
});
