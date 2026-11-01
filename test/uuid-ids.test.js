import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { createAuthInstance } from "@bitbaum/accountkit/auth/server";
import { createAuthTables } from "@bitbaum/accountkit/auth/schema";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function signUp(ids) {
  const pg = new PGlite();
  const tables = createAuthTables("auth_");
  await pg.exec(
    (
      await generateMigration(
        generateDrizzleJson({}),
        generateDrizzleJson(tables),
      )
    ).join("\n"),
  );
  const site = { url: "https://ids.example.test", title: "Ids", slug: "ids" };
  const auth = createAuthInstance({
    site,
    database: drizzle(pg, { schema: tables }),
    schema: tables,
    ids,
    mail: { configured: false, send: async () => {} },
    env: {
      NODE_ENV: "test",
      BETTER_AUTH_SECRET: "synthetic-uuid-ids-secret-at-least-32-characters",
    },
  });
  const response = await auth.handler(
    new Request(site.url + "/api/auth/sign-up/email", {
      method: "POST",
      headers: { origin: site.url, "content-type": "application/json" },
      body: JSON.stringify({
        email: "p@example.test",
        password: "synthetic pw",
        name: "",
      }),
    }),
  );
  assert.equal(response.status, 200);
  const user = (await pg.query("SELECT id FROM auth_users")).rows[0].id;
  const session = (await pg.query("SELECT id FROM auth_sessions")).rows[0].id;
  await pg.close();
  return { user, session };
}

test('ids: "uuid" gives every new person (and session) a UUID', async () => {
  const { user, session } = await signUp("uuid");
  assert.match(user, UUID);
  assert.match(session, UUID);
  // A product row keyed on uuid accepts the new person's id.
  const product = new PGlite();
  await product.exec(`CREATE TABLE people (id uuid PRIMARY KEY)`);
  await product.query("INSERT INTO people (id) VALUES ($1)", [user]);
  await product.close();
});

test("without ids, better-auth's own string ids stay the default", async () => {
  const { user } = await signUp(undefined);
  assert.doesNotMatch(user, UUID);
});
