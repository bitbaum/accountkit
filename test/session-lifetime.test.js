import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { pushSchema } from "drizzle-kit/api";
import { createAuthInstance } from "@bitbaum/accountkit/auth/server";
import { authSchema } from "@bitbaum/accountkit/auth/schema";

test("a product idle limit shortens, slides and ends named people's sessions only", async () => {
  const pg = new PGlite();
  try {
    const db = drizzle(pg, { schema: authSchema });
    await (await pushSchema(authSchema, db)).apply();
    const site = {
      url: "https://life.example.test",
      title: "Life",
      slug: "life",
    };
    const EIGHT_HOURS = 8 * 60 * 60;
    const auth = createAuthInstance({
      site,
      database: db,
      mail: { configured: false, send: async () => {} },
      env: {
        NODE_ENV: "test",
        BETTER_AUTH_SECRET:
          "synthetic-session-lifetime-secret-at-least-32-chars",
      },
      sessionLifetime: async (userId) =>
        userId === (await staffId()) ? EIGHT_HOURS : null,
    });
    const post = (path, body) =>
      auth.handler(
        new Request(site.url + "/api/auth" + path, {
          method: "POST",
          headers: { origin: site.url, "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    const cookie = (r) =>
      r.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
    const read = async (c) =>
      (
        await auth.handler(
          new Request(site.url + "/api/auth/get-session", {
            headers: { cookie: c },
          }),
        )
      ).json();
    const row = async (email) => {
      const [u] = await db
        .select()
        .from(authSchema.user)
        .where(eq(authSchema.user.email, email));
      const [s] = await db
        .select()
        .from(authSchema.session)
        .where(eq(authSchema.session.userId, u.id));
      return s;
    };
    let staff;
    const staffId = async () => staff;

    const signedUpStaff = await post("/sign-up/email", {
      email: "staff@example.test",
      password: "synthetic staff password",
      name: "Staff",
    });
    staff = (await signedUpStaff.json()).user.id;
    const other = await post("/sign-up/email", {
      email: "other@example.test",
      password: "synthetic other password",
      name: "Other",
    });

    assert.equal((await read(cookie(signedUpStaff))).user.id, staff);
    const clamped = await row("staff@example.test");
    const remaining = clamped.expiresAt.getTime() - Date.now();
    assert.ok(
      remaining <= EIGHT_HOURS * 1000 &&
        remaining > EIGHT_HOURS * 1000 - 60_000,
    );

    await read(cookie(signedUpStaff));
    assert.equal(
      (await row("staff@example.test")).expiresAt.getTime(),
      clamped.expiresAt.getTime(),
      "no write and no 14-day refresh within the window",
    );

    // Active two hours ago: still signed in, extended to a full limit again.
    const twoHoursAgo = new Date(Date.now() - 2 * 3600_000);
    await db
      .update(authSchema.session)
      .set({
        updatedAt: twoHoursAgo,
        expiresAt: new Date(Date.now() + 6 * 3600_000),
      })
      .where(eq(authSchema.session.id, clamped.id));
    assert.equal((await read(cookie(signedUpStaff))).user.id, staff);
    const slid =
      (await row("staff@example.test")).expiresAt.getTime() - Date.now();
    assert.ok(slid > 7.9 * 3600_000 && slid <= EIGHT_HOURS * 1000);

    // Idle nine hours, even with a long expiry on the row: ended.
    await db
      .update(authSchema.session)
      .set({
        updatedAt: new Date(Date.now() - 9 * 3600_000),
        expiresAt: new Date(Date.now() + 10 * 24 * 3600_000),
      })
      .where(eq(authSchema.session.id, clamped.id));
    assert.equal(await read(cookie(signedUpStaff)), null);
    assert.equal(await row("staff@example.test"), undefined);

    // Everyone else keeps the shared default.
    await read(cookie(other));
    const theirs =
      (await row("other@example.test")).expiresAt.getTime() - Date.now();
    assert.ok(theirs > 13 * 24 * 3600_000);
  } finally {
    await pg.close();
  }
});
