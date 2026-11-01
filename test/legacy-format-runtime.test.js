import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import bcrypt from "bcryptjs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { verifyPassword as verifyNativePassword } from "better-auth/crypto";
import { pushSchema } from "drizzle-kit/api";
import { createAuthRuntime } from "@bitbaum/accountkit/auth/next";
import { authSchema } from "@bitbaum/accountkit/auth/schema";

// A product's own pre-AccountKit format: Node's default scrypt, stored as
// `<hex>.<salt>` (what Loki wrote before moving to AccountKit).
const scryptAsync = promisify(scrypt);
const ownHash = async (password) => {
  const salt = randomBytes(16).toString("hex");
  return `${(await scryptAsync(password, salt, 64)).toString("hex")}.${salt}`;
};
const legacyPassword = {
  matches: (hash) => /^[0-9a-f]{128}\.[0-9a-f]{32}$/.test(hash),
  verify: async (password, hash) => {
    const [hex, salt] = hash.split(".");
    const expected = Buffer.from(hex, "hex");
    const actual = await scryptAsync(password, salt, 64);
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  },
};

test("a product's own password format signs in, beside bcrypt, and a change writes the native format", async () => {
  const pg = new PGlite();
  try {
    const db = drizzle(pg, { schema: authSchema });
    await (await pushSchema(authSchema, db)).apply();
    const site = {
      url: "https://format.example.ch",
      title: "Format",
      slug: "format",
    };
    const auth = createAuthRuntime({
      site,
      mail: { configured: false, send: async () => {} },
      env: {
        NODE_ENV: "production",
        BETTER_AUTH_SECRET:
          "synthetic-format-runtime-secret-at-least-32-characters",
      },
      legacyBcrypt: bcrypt,
      legacyPassword,
      isDatabaseConfigured: () => true,
      getDatabase: () => db,
    }).getAuth();
    const post = (path, body, cookie = "") =>
      auth.handler(
        new Request(site.url + "/api/auth" + path, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: site.url,
            cookie,
          },
          body: JSON.stringify(body),
        }),
      );
    const cookieOf = (response) =>
      response.headers
        .getSetCookie()
        .map((v) => v.split(";")[0])
        .join("; ");

    const people = [
      {
        id: "own-format",
        password: "own format password",
        hash: await ownHash("own format password"),
      },
      {
        id: "bcrypt-format",
        password: "bcrypt password",
        hash: await bcrypt.hash("bcrypt password", 4),
      },
    ];
    for (const person of people) {
      await db.insert(authSchema.user).values({
        id: person.id,
        email: `${person.id}@example.ch`,
        name: "",
        emailVerified: true,
      });
      await db.insert(authSchema.account).values({
        id: `${person.id}-credential`,
        accountId: person.id,
        userId: person.id,
        providerId: "credential",
        password: person.hash,
      });
      const email = `${person.id}@example.ch`;
      assert.equal(
        (await post("/sign-in/email", { email, password: person.password }))
          .status,
        200,
      );
      assert.equal(
        (await post("/sign-in/email", { email, password: "not the password" }))
          .status,
        401,
        `${person.id}: a wrong password is refused`,
      );
    }

    const email = "own-format@example.ch";
    const login = await post("/sign-in/email", {
      email,
      password: "own format password",
    });
    const changed = await post(
      "/change-password",
      {
        currentPassword: "own format password",
        newPassword: "a native password now",
      },
      cookieOf(login),
    );
    assert.equal(changed.status, 200);
    const [row] = await db
      .select()
      .from(authSchema.account)
      .where(eq(authSchema.account.userId, "own-format"));
    assert.equal(
      legacyPassword.matches(row.password),
      false,
      "the change leaves the old format",
    );
    assert.equal(
      await verifyNativePassword({
        password: "a native password now",
        hash: row.password,
      }),
      true,
    );
    assert.equal(
      (
        await post("/sign-in/email", {
          email,
          password: "a native password now",
        })
      ).status,
      200,
    );
  } finally {
    await pg.close();
  }
});
