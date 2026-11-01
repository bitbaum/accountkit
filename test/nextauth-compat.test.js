import { test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { pushSchema } from "drizzle-kit/api";
import { createAuthRuntime } from "@bitbaum/accountkit/auth/next";
import { createAuthTables } from "@bitbaum/accountkit/auth/schema";
import {
  createNextAuthCompat,
  sameOriginPath,
} from "@bitbaum/accountkit/auth/nextauth-compat";
import { createCompatClient } from "@bitbaum/accountkit/auth/compat-testing";
import {
  countsSql,
  rehearseImport,
} from "@bitbaum/accountkit/auth/import-rehearsal";

const SITE = "https://compat.example.test";
const PASSWORD = "synthetic legacy password";

/** A product with its own `people` rows, its accounts imported into auth_*. */
async function product({ codes, linkWhenSignedIn } = {}) {
  const pg = new PGlite();
  const tables = createAuthTables("auth_");
  const db = drizzle(pg, { schema: tables });
  await (await pushSchema(tables, db)).apply();
  await pg.exec(
    `CREATE TABLE people (id text PRIMARY KEY, role text NOT NULL, locked boolean NOT NULL DEFAULT false)`,
  );
  const hash = await bcrypt.hash(PASSWORD, 4);
  for (const [id, email, role, locked] of [
    ["p-1", "owner@example.test", "owner", false],
    ["p-2", "locked@example.test", "member", true],
  ]) {
    await pg.query(`INSERT INTO people VALUES ($1, $2, $3)`, [
      id,
      role,
      locked,
    ]);
    await db
      .insert(tables.user)
      .values({ id, email, name: id, emailVerified: false });
    await db.insert(tables.account).values({
      id: `${id}-credential`,
      accountId: id,
      providerId: "credential",
      userId: id,
      password: hash,
    });
  }
  const runtime = createAuthRuntime({
    site: { url: SITE, title: "Compat", slug: "compat" },
    mail: { configured: false, send: async () => {} },
    env: {
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "synthetic-compat-runtime-secret-at-least-32-chars",
    },
    isDatabaseConfigured: () => true,
    getDatabase: () => db,
    schema: tables,
    legacyBcrypt: bcrypt,
  });
  const events = { signedIn: [], refused: [] };
  const compat = createNextAuthCompat({
    runtime,
    siteUrl: () => SITE,
    signInPath: "/login",
    landing: "/dashboard",
    codes,
    env: () => ({}),
    linkWhenSignedIn,
    toSession: async (shared) => {
      const { rows } = await pg.query(
        `SELECT id, role FROM people WHERE id = $1`,
        [shared.user.id],
      );
      return rows[0]
        ? {
            user: {
              id: rows[0].id,
              role: rows[0].role,
              email: shared.user.email,
            },
          }
        : null;
    },
    credentials: {
      credentials: {
        name: "Email",
        resolve: async (form) => {
          const email = String(form.get("email") ?? "").toLowerCase();
          if (!email) return null;
          const { rows } = await pg.query(
            `SELECT p.locked FROM people p JOIN auth_users u ON u.id = p.id WHERE u.email = $1`,
            [email],
          );
          return rows[0]?.locked ? { refuse: "account_locked" } : { email };
        },
      },
    },
    onSignedIn: async (event) => events.signedIn.push(event),
    onRefused: async (event) => events.refused.push(event),
  });
  return {
    pg,
    db,
    tables,
    runtime,
    compat,
    events,
    client: createCompatClient({ compat, site: SITE }),
  };
}

test("a password sign-in through next-auth/react's protocol yields the product's session", async () => {
  const { client, events, pg } = await product();
  try {
    const result = await client.signIn(
      "credentials",
      { email: "OWNER@example.test", password: PASSWORD },
      `${SITE}/settings`,
    );
    assert.equal(client.refusal(result), null);
    assert.equal(
      result.url,
      `${SITE}/settings`,
      "a same-origin callbackUrl is kept",
    );
    assert.deepEqual(await client.session(), {
      user: { id: "p-1", role: "owner", email: "owner@example.test" },
    });
    assert.equal(events.signedIn.length, 1);
    assert.equal(events.signedIn[0].user.id, "p-1");

    await pg.query(`UPDATE people SET role = 'member' WHERE id = 'p-1'`);
    assert.equal(
      (await client.update()).user.role,
      "member",
      "update() is a fresh read",
    );

    const out = await client.signOut(`${SITE}/goodbye`);
    assert.equal(out.url, `${SITE}/goodbye`);
    assert.equal(
      await client.session(),
      null,
      "signed out reads as null, never {}",
    );
  } finally {
    await pg.close();
  }
});

test("refusals carry the login page's own codes", async () => {
  const { client, events, pg } = await product({
    codes: { credentials: "invalid_credentials", missing: "missing_fields" },
  });
  try {
    const wrong = await client.signIn("credentials", {
      email: "owner@example.test",
      password: "nope",
    });
    assert.equal(client.refusal(wrong), "CredentialsSignin");
    assert.equal(client.code(wrong), "invalid_credentials");
    assert.equal(events.refused[0].reason, "credentials");

    const locked = await client.signIn("credentials", {
      email: "locked@example.test",
      password: PASSWORD,
    });
    assert.equal(
      client.code(locked),
      "account_locked",
      "a resolver's refusal is passed through",
    );
    assert.equal(
      events.refused.length,
      1,
      "AccountKit was never asked for the locked account",
    );

    assert.equal(
      client.code(await client.signIn("credentials", { password: PASSWORD })),
      "missing_fields",
    );
    assert.equal(await client.session(), null);
  } finally {
    await pg.close();
  }
});

test("only what the screens use is open; providers list the product's methods", async () => {
  const { client, compat, pg } = await product();
  try {
    for (const route of [
      "/sign-up/email",
      "/change-password",
      "/request-password-reset",
      "/callback/github",
    ]) {
      assert.equal(
        (await client.call(route, { email: "x@example.test" })).status,
        404,
        route,
      );
    }
    assert.deepEqual(Object.keys(compat.providers()), ["credentials"]);
    const unsupported = await client.call("/signin/github");
    assert.equal(unsupported.status, 302);
    assert.equal(
      unsupported.headers.get("location"),
      `${SITE}/login?error=OAuthSignin`,
    );
    assert.equal((await client.call("/csrf")).status, 200);
  } finally {
    await pg.close();
  }
});

test("sessionIdFor names the session that makes a change; a deleted person reads as signed out", async () => {
  const { client, compat, pg } = await product();
  try {
    await client.signIn("credentials", {
      email: "owner@example.test",
      password: PASSWORD,
    });
    const id = await compat.sessionIdFor(
      new Headers({ cookie: client.cookie }),
    );
    const { rows } = await pg.query(`SELECT id FROM auth_sessions`);
    assert.deepEqual(
      rows.map((row) => row.id),
      [id],
    );
    await pg.query(`DELETE FROM people WHERE id = 'p-1'`);
    assert.equal(
      await compat.sessionFor(new Headers({ cookie: client.cookie })),
      null,
    );
  } finally {
    await pg.close();
  }
});

test("a cross-site navigation cannot start an OIDC round-trip", async () => {
  const pg = new PGlite();
  try {
    const tables = createAuthTables("auth_");
    const db = drizzle(pg, { schema: tables });
    await (await pushSchema(tables, db)).apply();
    const env = {
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "synthetic-compat-runtime-secret-at-least-32-chars",
      ORANGECAT_OAUTH_CLIENT_ID: "compat",
      ORANGECAT_OAUTH_CLIENT_SECRET: "secret",
    };
    const runtime = createAuthRuntime({
      site: { url: SITE, title: "Compat", slug: "compat" },
      mail: { configured: false, send: async () => {} },
      env,
      isDatabaseConfigured: () => true,
      getDatabase: () => db,
      schema: tables,
    });
    const compat = createNextAuthCompat({
      runtime,
      siteUrl: () => SITE,
      signInPath: "/login",
      landing: "/",
      env: () => env,
      toSession: async () => null,
      credentials: {},
    });
    assert.deepEqual(Object.keys(compat.providers()), ["orangecat"]);
    const response = await compat.route.GET(
      new Request(`${SITE}/api/auth/signin/orangecat?callbackUrl=/x`, {
        headers: { "sec-fetch-site": "cross-site" },
      }),
    );
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), `${SITE}/login`);
  } finally {
    await pg.close();
  }
});

test("sameOriginPath keeps only same-origin paths", () => {
  assert.equal(sameOriginPath(`${SITE}/a?b=1`, SITE, "/"), "/a?b=1");
  assert.equal(sameOriginPath("/relative", SITE, "/"), "/relative");
  assert.equal(
    sameOriginPath("https://evil.example/x", SITE, "/home"),
    "/home",
  );
  assert.equal(sameOriginPath("//evil.example/x", SITE, "/home"), "/home");
  assert.equal(sameOriginPath(null, SITE, "/home"), "/home");
});

test("the import rehearsal counts what the import wrote and rolls everything back", async () => {
  const pg = new PGlite();
  try {
    const tables = createAuthTables("auth_");
    await (await pushSchema(tables, drizzle(pg, { schema: tables }))).apply();
    const begin = async (work) => {
      await pg.transaction(async (tx) => {
        await work(async (text) => (await tx.exec(text)).at(-1)?.rows ?? []);
      });
    };
    const sql = `
      INSERT INTO auth_users (id, name, email, email_verified) VALUES
        ('a', '', 'a@example.test', true), ('b', '', 'b@example.test', false);
      INSERT INTO auth_accounts (id, account_id, provider_id, user_id, password) VALUES
        ('a-c', 'a', 'credential', 'a', 'x'), ('b-o', 'sub', 'orangecat', 'b', NULL);`;
    assert.deepEqual(await rehearseImport({ begin, sql }), {
      rehearsal: "rolled_back",
      accounts: 2,
      verified_addresses: 1,
      password_accounts: 1,
      linked: { orangecat: 1 },
    });
    const { rows } = await pg.query(
      `SELECT count(*)::int AS n FROM auth_users`,
    );
    assert.equal(rows[0].n, 0, "nothing stays");
    await assert.rejects(
      rehearseImport({
        begin,
        sql: "INSERT INTO auth_users (id) VALUES ('no email')",
      }),
      /^Error: Account import rehearsal failed; transaction rolled back$/,
      "a failure never carries the database's message",
    );
    assert.throws(() => countsSql("x; DROP"), /prefix/);
  } finally {
    await pg.close();
  }
});
