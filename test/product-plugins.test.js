import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { organization } from "better-auth/plugins";
import { createAuthInstance } from "@bitbaum/accountkit/auth/server";
import { authSchema } from "@bitbaum/accountkit/auth/schema";

// A product's workspace tables, as a product like Hirnli declares them.
const session = pgTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull(),
  activeOrganizationId: text("active_organization_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
const org = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
const member = pgTable("members", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
const invitation = pgTable("invitations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  inviterId: text("inviter_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

test("a product's own plugin mounts beside the shared methods, on its own tables", async () => {
  const pg = new PGlite();
  try {
    const schema = {
      ...authSchema,
      session,
      organization: org,
      member,
      invitation,
    };
    await pg.exec(
      (
        await generateMigration(
          generateDrizzleJson({}),
          generateDrizzleJson(schema),
        )
      ).join("\n"),
    );
    const site = {
      url: "https://plugins.example.test",
      title: "Plugins",
      slug: "plugins",
      trustedOrigins: ["https://tenant.example.test/"],
    };
    const auth = createAuthInstance({
      site,
      database: drizzle(pg, { schema }),
      schema,
      plugins: [organization({ allowUserToCreateOrganization: true })],
      mail: { configured: false, send: async () => {} },
      env: {
        NODE_ENV: "test",
        BETTER_AUTH_SECRET: "synthetic-product-plugin-secret-at-least-32-chars",
      },
    });
    const call = (path, body, cookie = "") =>
      auth.handler(
        new Request(site.url + "/api/auth" + path, {
          method: body ? "POST" : "GET",
          headers: {
            origin: site.url,
            "content-type": "application/json",
            cookie,
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      );
    const signedUp = await call("/sign-up/email", {
      email: "owner@example.test",
      password: "synthetic owner password",
      name: "",
    });
    assert.equal(signedUp.status, 200);
    const cookie = signedUp.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const created = await call(
      "/organization/create",
      { name: "Synthetic Org", slug: "synthetic-org" },
      cookie,
    );
    assert.equal(created.status, 200);
    const list = await call("/organization/list", null, cookie);
    assert.deepEqual(
      (await list.json()).map((o) => o.slug),
      ["synthetic-org"],
    );
    // A second host of the same product passes the origin check; others do not.
    const fromOrigin = (origin) =>
      auth.handler(
        new Request(site.url + "/api/auth/sign-in/email", {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify({
            email: "owner@example.test",
            password: "synthetic owner password",
          }),
        }),
      );
    const tenant = await fromOrigin("https://tenant.example.test");
    assert.equal(tenant.status, 200);
    assert.equal(
      (await fromOrigin("https://foreign.example.test")).status,
      403,
    );
    // The shared rules still hold: a role in the body is never accepted.
    const { rows } = await pg.query("SELECT role FROM users");
    assert.deepEqual(rows, [{ role: "customer" }]);
  } finally {
    await pg.close();
  }
});
