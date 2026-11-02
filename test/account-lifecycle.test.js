// A product's own row for every person, however they came in, and gone when
// their account is: onAccountCreated and onAccountDeleted against a real
// (in-memory) Postgres, through the endpoints a person actually uses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { pushSchema } from "drizzle-kit/api";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { createAuthInstance, NO_SIGN_IN_METHOD } from "../dist/auth/server.js";
import * as schema from "../dist/auth/schema.js";
import { oidcFixture } from "./oidc-fixture.js";

const SECRET =
  "synthetic-lifecycle-fixture-secret-with-more-than-32-characters";

async function harness({
  env = {},
  plugins,
  site: siteOverride,
  accountDeletion,
} = {}) {
  const pg = new PGlite();
  const db = drizzle(pg, { schema: schema.authSchema });
  await (await pushSchema(schema.authSchema, db)).apply();
  const site = siteOverride ?? {
    url: "https://lifecycle.example.test",
    title: "Lifecycle fixture",
    slug: "lifecycle",
  };
  const sent = [];
  const created = [];
  const deleted = [];
  const auth = createAuthInstance({
    site,
    database: db,
    env: { NODE_ENV: "test", BETTER_AUTH_SECRET: SECRET, ...env },
    mail: {
      configured: true,
      send: async (kind, to, url) => void sent.push({ kind, to, url }),
    },
    plugins,
    accountDeletion,
    onAccountCreated: async (account) => void created.push(account),
    onAccountDeleted: async (account) => void deleted.push(account),
  });
  const cookies = new Map();
  const call = async (path, body) => {
    const response = await auth.handler(
      new Request(new URL(path, site.url), {
        method: body === undefined ? "GET" : "POST",
        headers: {
          origin: site.url,
          "content-type": "application/json",
          cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
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
  const count = async (table, userId) =>
    (
      await pg.query(
        `SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`,
        [userId],
      )
    ).rows[0].n;
  const users = async (id) =>
    (await pg.query(`SELECT count(*)::int AS n FROM users WHERE id = $1`, [id]))
      .rows[0].n;
  return {
    pg,
    site,
    sent,
    created,
    deleted,
    call,
    post,
    session,
    count,
    users,
    cookies,
  };
}

test("a password sign-up is reported once, as its credential", async () => {
  const h = await harness();
  try {
    const r = await h.post("/sign-up/email", {
      email: "pw-lifecycle@example.test",
      password: "a synthetic lifecycle passphrase",
      name: "",
    });
    assert.equal(r.status, 200);
    assert.equal(h.created.length, 1);
    assert.equal(h.created[0].providerId, "credential");
  } finally {
    await h.pg.close();
  }
});

test("an email sign-in link to a new address reports the new person exactly once", async () => {
  const h = await harness();
  try {
    const email = "link-lifecycle@example.invalid";
    assert.equal(
      (await h.post("/sign-in/magic-link", { email, callbackURL: "/account" }))
        .status,
      200,
    );
    const link = h.sent.at(-1);
    assert.equal(link.kind, "magicLink");
    assert.equal((await h.call(link.url)).status, 302);
    const person = (await h.session()).user;
    assert.equal(person.email, email);
    assert.deepEqual(h.created, [
      {
        userId: person.id,
        providerId: NO_SIGN_IN_METHOD,
        accountId: person.id,
        tokens: {
          accessToken: null,
          refreshToken: null,
          idToken: null,
          accessTokenExpiresAt: null,
          scope: null,
        },
      },
    ]);
    // The same person signing in by link again is not new.
    await h.post("/sign-out");
    await h.post("/sign-in/magic-link", { email, callbackURL: "/account" });
    assert.equal((await h.call(h.sent.at(-1).url)).status, 302);
    assert.equal((await h.session()).user.id, person.id);
    assert.equal(
      h.created.length,
      1,
      "an existing person is never re-reported",
    );
  } finally {
    await h.pg.close();
  }
});

test("a first OIDC sign-in reports the new person once, as that provider", async () => {
  const fixture = oidcFixture();
  fixture.install();
  const h = await harness({
    site: {
      url: "https://oidc-lifecycle.example.test",
      title: "OIDC lifecycle",
      slug: "oidc-lifecycle",
    },
    env: {
      ORANGECAT_OAUTH_ISSUER: fixture.issuer,
      ORANGECAT_OAUTH_CLIENT_ID: fixture.clientId,
      ORANGECAT_OAUTH_CLIENT_SECRET: fixture.clientSecret,
    },
  });
  try {
    const started = await h.post("/sign-in/social", {
      provider: "orangecat",
      callbackURL: "/account",
    });
    assert.equal(started.status, 200);
    const target = fixture.approve(new URL((await started.json()).url));
    assert.equal((await h.call(target.href)).status, 302);
    const person = (await h.session()).user;
    assert.ok(person?.id);
    assert.equal(h.created.length, 1);
    assert.equal(h.created[0].providerId, "orangecat");
    assert.equal(h.created[0].userId, person.id);
  } finally {
    fixture.restore();
    await h.pg.close();
  }
});

test("deleting an account tells the product once it is gone", async () => {
  const h = await harness();
  try {
    const credentials = {
      email: "delete-lifecycle@example.invalid",
      password: "a synthetic lifecycle passphrase",
    };
    await h.post("/sign-up/email", { ...credentials, name: "" });
    const person = (await h.session()).user;
    const r = await h.post("/delete-user", { password: credentials.password });
    assert.equal(r.status, 200);
    assert.deepEqual(h.deleted, [
      { userId: person.id, email: credentials.email },
    ]);
    assert.equal(await h.users(person.id), 0);
    assert.equal(await h.count("accounts", person.id), 0);
    assert.equal(await h.count("sessions", person.id), 0);
  } finally {
    await h.pg.close();
  }
});

test("a product's refusal stops a deletion before anything is deleted", async () => {
  const refuse = {
    id: "refuse-delete",
    hooks: {
      before: [
        {
          matcher: ({ path }) => path === "/delete-user",
          handler: createAuthMiddleware(async () => {
            throw new APIError("FORBIDDEN", {
              code: "ACCOUNT_KEPT",
              message: "This account is kept.",
            });
          }),
        },
      ],
    },
  };
  const h = await harness({ plugins: [refuse] });
  try {
    const credentials = {
      email: "kept-lifecycle@example.invalid",
      password: "a synthetic lifecycle passphrase",
    };
    await h.post("/sign-up/email", { ...credentials, name: "" });
    const person = (await h.session()).user;
    const r = await h.post("/delete-user", { password: credentials.password });
    assert.equal(r.status, 403);
    assert.equal((await r.json()).code, "ACCOUNT_KEPT");
    assert.deepEqual(h.deleted, []);
    assert.equal(await h.users(person.id), 1);
    assert.equal(await h.count("accounts", person.id), 1);
    assert.equal((await h.session()).user.id, person.id, "still signed in");
  } finally {
    await h.pg.close();
  }
});

test("a product that keeps accounts offers no deletion endpoint", async () => {
  const h = await harness({ accountDeletion: false });
  try {
    const credentials = {
      email: "retained-lifecycle@example.invalid",
      password: "a synthetic lifecycle passphrase",
    };
    await h.post("/sign-up/email", { ...credentials, name: "" });
    const person = (await h.session()).user;
    const r = await h.post("/delete-user", { password: credentials.password });
    assert.equal(r.status, 404);
    assert.deepEqual(h.deleted, []);
    assert.equal(await h.users(person.id), 1);
    assert.equal(await h.count("accounts", person.id), 1);
    assert.equal((await h.session()).user.id, person.id, "still signed in");
  } finally {
    await h.pg.close();
  }
});
