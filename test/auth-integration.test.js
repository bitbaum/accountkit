// Accounts end to end against a real (in-memory) Postgres built from the
// package's own schema: the check that the tables and better-auth agree, which
// no unit test can make.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { pushSchema } from "drizzle-kit/api";
import { createAuthInstance } from "../dist/auth/server.js";
import * as schema from "../dist/auth/schema.js";

process.env.BETTER_AUTH_SECRET = "t".repeat(48);
const SITE = {
  url: "https://app.example.ch",
  title: "Example",
  slug: "example",
};
const sent = [];
const mail = {
  configured: false,
  send: async (kind, to, url) => void sent.push({ kind, to, url }),
};

let pg, db, auth;
before(async () => {
  pg = new PGlite();
  db = drizzle(pg, { schema: schema.authSchema });
  const { apply } = await pushSchema(schema.authSchema, db);
  await apply();
  auth = createAuthInstance({
    site: SITE,
    database: db,
    mail,
    env: { ...process.env, NODE_ENV: "test" },
  });
});
after(() => pg.close());

const post = (path, body, cookie) =>
  auth.handler(
    new Request(`${SITE.url}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: SITE.url,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
const cookieOf = (r) =>
  r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
const sessionOf = async (cookie) =>
  (
    await auth.handler(
      new Request(`${SITE.url}/api/auth/get-session`, { headers: { cookie } }),
    )
  ).json();

test("a person registers with no other product, and is signed in at once when there is no mail", async () => {
  const r = await post("/sign-up/email", {
    email: "ada@example.ch",
    password: "correct horse battery",
    name: "",
  });
  assert.equal(r.status, 200);
  const s = await sessionOf(cookieOf(r));
  assert.equal(s.user.email, "ada@example.ch");
  assert.equal(s.user.role, "customer");
});

test("a sign-up cannot choose its own role", async () => {
  const r = await post("/sign-up/email", {
    email: "eve@example.ch",
    password: "correct horse battery",
    name: "Eve",
    role: "admin",
  });
  const s = await sessionOf(cookieOf(r));
  assert.equal(s.user.role, "customer");
});

test("signing in needs the right password; the right one works", async () => {
  assert.equal(
    (
      await post("/sign-in/email", {
        email: "ada@example.ch",
        password: "wrong wrong wrong",
      })
    ).status,
    401,
  );
  const ok = await post("/sign-in/email", {
    email: "ada@example.ch",
    password: "correct horse battery",
  });
  assert.equal(ok.status, 200);
  assert.ok((await sessionOf(cookieOf(ok))).user);
});

test("a short password is refused", async () => {
  const r = await post("/sign-up/email", {
    email: "short@example.ch",
    password: "tooshort",
    name: "",
  });
  assert.equal(r.status, 400);
});

test("with no mail configured, no mail is ever sent", () => {
  assert.equal(sent.length, 0);
});

test("onAccountCreated is told about every sign-up, and a throw never blocks it", async () => {
  const seen = [];
  const other = createAuthInstance({
    site: SITE,
    database: db,
    mail,
    env: { ...process.env, NODE_ENV: "test" },
    onAccountCreated: async (a) => {
      seen.push(a);
      throw new Error("boom");
    },
  });
  const r = await other.handler(
    new Request(`${SITE.url}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: SITE.url },
      body: JSON.stringify({
        email: "hook@example.ch",
        password: "correct horse battery",
        name: "",
      }),
    }),
  );
  assert.equal(r.status, 200);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].providerId, "credential");
});
