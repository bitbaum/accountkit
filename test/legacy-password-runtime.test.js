import { test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { verifyPassword as verifyNativePassword } from "better-auth/crypto";
import { pushSchema } from "drizzle-kit/api";
import { createPasswordHasher } from "@bitbaum/accountkit/auth/hash";
import { createAuthRuntime } from "@bitbaum/accountkit/auth/next";
import { authSchema } from "@bitbaum/accountkit/auth/schema";

test("imported bcrypt credentials retain identity and reset into the native runtime format", async () => {
  const pg = new PGlite();
  try {
    const db = drizzle(pg, { schema: authSchema });
    await (await pushSchema(authSchema, db)).apply();
    const site = {
      url: "https://migration.example.ch",
      title: "Migration",
      slug: "migration",
    };
    const sent = [];
    const mail = {
      configured: false,
      send: async (kind, to, url) => {
        sent.push({ kind, to, url });
      },
    };
    const runtime = () =>
      createAuthRuntime({
        site,
        mail,
        legacyBcrypt: bcrypt,
        isDatabaseConfigured: () => true,
        getDatabase: () => db,
      });
    let auth = runtime().getAuth();
    const post = (path, body) =>
      auth.handler(
        new Request(site.url + "/api/auth" + path, {
          method: "POST",
          headers: { "content-type": "application/json", origin: site.url },
          body: JSON.stringify(body),
        }),
      );
    const cookies = (response) =>
      response.headers
        .getSetCookie()
        .map((v) => v.split(";")[0])
        .join("; ");
    const session = async (cookie) =>
      (
        await auth.handler(
          new Request(site.url + "/api/auth/get-session", {
            headers: { cookie },
          }),
        )
      ).json();
    const imported = [
      {
        id: "existing-bcrypt-account",
        password: "existing credential",
        hash: await bcrypt.hash("existing credential", 4),
      },
      {
        id: "existing-bs1-account",
        password: "x".repeat(80) + "a",
        hash: await createPasswordHasher(bcrypt, 4).hash("x".repeat(80) + "a"),
      },
    ];
    const signup = await post("/sign-up/email", {
      email: "new-account@example.ch",
      password: "new native credential",
      name: "",
    });
    assert.equal(signup.status, 200);
    const created = await session(cookies(signup));
    const credentials = await db
      .select()
      .from(authSchema.account)
      .where(eq(authSchema.account.userId, created.user.id));
    assert.equal(
      await verifyNativePassword({
        password: "new native credential",
        hash: credentials[0].password,
      }),
      true,
    );
    for (const row of imported) {
      const email = row.id + "@example.ch";
      await db.insert(authSchema.user).values({
        id: row.id,
        email,
        name: "",
        emailVerified: true,
        role: "customer",
      });
      await db.insert(authSchema.account).values({
        id: row.id + "-credential",
        accountId: row.id,
        userId: row.id,
        providerId: "credential",
        password: row.hash,
      });
      const login = await post("/sign-in/email", {
        email,
        password: row.password,
      });
      assert.equal(login.status, 200);
      const oldCookie = cookies(login);
      assert.equal(
        (await session(oldCookie)).user.id,
        row.id,
        "product rows keep their original owner",
      );
      assert.equal(
        (await post("/sign-in/email", { email, password: "wrong credential" }))
          .status,
        401,
      );
      if (row.id.includes("bs1")) {
        assert.equal(
          (
            await post("/sign-in/email", {
              email,
              password: "x".repeat(80) + "b",
            })
          ).status,
          401,
          "characters after bcrypt's byte limit still count",
        );
      }
      mail.configured = true;
      auth = runtime().getAuth();
      assert.equal(
        (
          await post("/request-password-reset", {
            email,
            redirectTo: site.url + "/sign-in",
          })
        ).status,
        200,
      );
      const callback = await auth.handler(new Request(sent.at(-1).url));
      const token = new URL(callback.headers.get("location")).searchParams.get(
        "token",
      );
      assert.ok(token);
      assert.equal(
        (
          await post("/reset-password", {
            token,
            newPassword: "replacement credential",
          })
        ).status,
        200,
      );
      assert.equal(
        await session(oldCookie),
        null,
        "reset revokes the imported account's sessions",
      );
      assert.equal(
        (await post("/sign-in/email", { email, password: row.password }))
          .status,
        401,
      );
      const next = await post("/sign-in/email", {
        email,
        password: "replacement credential",
      });
      assert.equal(next.status, 200);
      assert.equal((await session(cookies(next))).user.id, row.id);
      const stored = await db
        .select()
        .from(authSchema.account)
        .where(eq(authSchema.account.userId, row.id));
      assert.ok(
        !stored[0].password.startsWith("$"),
        "reset writes native scrypt rather than legacy bcrypt",
      );
      assert.equal(
        await verifyNativePassword({
          password: "replacement credential",
          hash: stored[0].password,
        }),
        true,
      );
      assert.equal(
        (
          await post("/reset-password", {
            token,
            newPassword: "replayed credential",
          })
        ).status,
        400,
      );
    }
  } finally {
    await pg.close();
  }
});
