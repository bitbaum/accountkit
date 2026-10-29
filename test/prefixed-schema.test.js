import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableName } from "drizzle-orm";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { createAuthInstance } from "@bitbaum/accountkit/auth/server";
import { authSchema, createAuthTables } from "@bitbaum/accountkit/auth/schema";

const ddl = async (schema) =>
  (
    await generateMigration(
      generateDrizzleJson({}),
      generateDrizzleJson(schema),
    )
  ).join("\n");

test("prefixed account tables differ from the standard set only in their names", async () => {
  assert.deepEqual(Object.values(authSchema).map(getTableName), [
    "users",
    "sessions",
    "accounts",
    "verifications",
    "passkeys",
    "two_factors",
  ]);
  const prefixed = await ddl(createAuthTables("auth_"));
  assert.equal(prefixed.replaceAll("auth_", ""), await ddl(authSchema));
});

test("a product keeps its own users table and signs in through prefixed ones", async () => {
  const pg = new PGlite();
  try {
    // A NextAuth-era table under the standard name, which must stay untouched.
    await pg.exec(
      `CREATE TABLE users (id uuid PRIMARY KEY, email varchar(255) NOT NULL UNIQUE, role text)`,
    );
    const tables = createAuthTables("auth_");
    const db = drizzle(pg, { schema: tables });
    await pg.exec(await ddl(tables));
    const site = {
      url: "https://prefix.example.test",
      title: "Prefix",
      slug: "prefix",
    };
    const auth = createAuthInstance({
      site,
      database: db,
      schema: tables,
      mail: { configured: false, send: async () => {} },
      env: {
        NODE_ENV: "test",
        BETTER_AUTH_SECRET:
          "synthetic-prefixed-schema-secret-at-least-32-chars",
      },
    });
    const post = (path, body) =>
      auth.handler(
        new Request(site.url + "/api/auth" + path, {
          method: "POST",
          headers: { origin: site.url, "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    const credentials = {
      email: "person@example.test",
      password: "synthetic password",
    };
    assert.equal(
      (await post("/sign-up/email", { ...credentials, name: "" })).status,
      200,
    );
    assert.equal((await post("/sign-in/email", credentials)).status, 200);
    assert.equal((await pg.query("SELECT * FROM auth_users")).rows.length, 1);
    assert.equal(
      (await pg.query("SELECT * FROM auth_sessions")).rows.length,
      2,
    );
    assert.equal((await pg.query("SELECT * FROM users")).rows.length, 0);
  } finally {
    await pg.close();
  }
});
