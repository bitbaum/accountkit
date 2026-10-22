// The Next.js runtime: who is asking, and which id a product's rows use.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { pushSchema } from "drizzle-kit/api";
import { createAuthRuntime } from "../dist/auth/next.js";
import * as schema from "../dist/auth/schema.js";

process.env.BETTER_AUTH_SECRET = "r".repeat(48);
const SITE = {
  url: "https://app.example.ch",
  title: "Example",
  slug: "example",
};
let pg, db, runtime;
let n = 0;

before(async () => {
  pg = new PGlite();
  db = drizzle(pg, { schema: schema.authSchema });
  await (await pushSchema(schema.authSchema, db)).apply();
  runtime = createAuthRuntime({
    site: SITE,
    mail: { configured: false, send: async () => {} },
    isDatabaseConfigured: () => true,
    getDatabase: () => db,
    legacyIdentityProvider: "orangecat",
  });
});
after(() => pg.close());

async function signUp() {
  const r = await runtime.POST(
    new Request(`${SITE.url}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: SITE.url,
        "x-forwarded-for": `198.51.100.${++n}`,
      },
      body: JSON.stringify({
        email: `p${n}@example.ch`,
        password: "correct horse battery",
        name: "",
      }),
    }),
  );
  assert.equal(r.status, 200);
  return {
    cookie: r.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
    user: (await r.json()).user,
  };
}
const who = (cookie) =>
  runtime.requireUser(
    new Request(`${SITE.url}/api/x`, { headers: { cookie } }),
  );

test("no session: the answer to send is 401", async () => {
  const r = await who("");
  assert.equal(r.response.status, 401);
});

test("a person who registered here is their user id", async () => {
  const { cookie, user } = await signUp();
  assert.equal((await who(cookie)).user.actorId, user.id);
});

test("a person who came in through OrangeCat keeps the OrangeCat id their rows already use", async () => {
  const { cookie, user } = await signUp();
  // OrangeCat was their first way in; the password came after.
  await db.insert(schema.account).values({
    id: `a${n}`,
    accountId: "oc-actor-9",
    providerId: "orangecat",
    userId: user.id,
    createdAt: new Date(Date.now() - 60 * 60_000),
  });
  assert.equal((await who(cookie)).user.actorId, "oc-actor-9");
});

test("linking OrangeCat later never moves an id that already has data", async () => {
  const { cookie, user } = await signUp();
  await db.insert(schema.account).values({
    id: `b${n}`,
    accountId: "oc-actor-late",
    providerId: "orangecat",
    userId: user.id,
    createdAt: new Date(Date.now() + 60 * 60_000),
  });
  assert.equal((await who(cookie)).user.actorId, user.id);
});

test("a server component's session carries the same actorId as an API route's", async () => {
  // The two readers used to disagree: `getSession` returned better-auth's raw
  // session (no `actorId`) while `requireUser` attached one, so every server
  // component read `undefined` and drew the signed-out page.
  const { cookie, user } = await signUp();
  const session = await runtime.sessionFor(new Headers({ cookie }));
  assert.equal(session.user.actorId, user.id);
  assert.equal(session.user.actorId, (await who(cookie)).user.actorId);
  assert.equal(await runtime.sessionFor(new Headers()), null);
});
