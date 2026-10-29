import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { pushSchema } from "drizzle-kit/api";
import { createAuthInstance } from "@bitbaum/accountkit/auth/server";
import { authSchema } from "@bitbaum/accountkit/auth/schema";
import { CLAIM_ERRORS } from "@bitbaum/accountkit/auth";
import { authBucket } from "../dist/auth/limits.js";

const site = {
  url: "https://claim.example.test",
  title: "Claim",
  slug: "claim",
};
const env = {
  NODE_ENV: "test",
  BETTER_AUTH_SECRET: "synthetic-provisioning-secret-at-least-32-characters",
};

async function database() {
  const pg = new PGlite();
  const db = drizzle(pg, { schema: authSchema });
  await (await pushSchema(authSchema, db)).apply();
  return { pg, db };
}

const cookie = (r) =>
  r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

function client(auth) {
  const post = (path, body, headers = {}) =>
    auth.handler(
      new Request(site.url + "/api/auth" + path, {
        method: "POST",
        headers: {
          origin: site.url,
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify(body),
      }),
    );
  const session = async (cookies) =>
    (
      await auth.handler(
        new Request(site.url + "/api/auth/get-session", {
          headers: { cookie: cookies },
        }),
      )
    ).json();
  return { post, session };
}

/** A product's identities: proofs that name a shared user, single-use when asked. */
function product() {
  const proofs = new Map();
  const calls = [];
  return {
    calls,
    add(proof, userId, { linkable = true, singleUse = false } = {}) {
      proofs.set(proof, { userId, linkable, singleUse, taken: false });
    },
    provisioning: {
      resolve: async (credential) => {
        const proof = proofs.get(credential);
        if (!proof || proof.taken) return null;
        if (proof.singleUse) proof.taken = true;
        return {
          userId: proof.userId,
          ...(proof.linkable
            ? {
                link: async (target) => {
                  calls.push(["link", credential, target]);
                  proof.userId = target;
                },
              }
            : {}),
          complete: async (userId) =>
            calls.push(["complete", credential, userId]),
          release: async () => {
            proof.taken = false;
            calls.push(["release", credential]);
          },
        };
      },
    },
  };
}

test("claiming is opt-in, rate limited as a credential and rejects unknown proofs", async () => {
  const { pg, db } = await database();
  try {
    const mail = { configured: false, send: async () => {} };
    const ids = product();
    assert.equal(authBucket("/provision/claim"), "credential");
    const without = client(
      createAuthInstance({ site, database: db, mail, env }),
    );
    assert.equal(
      (
        await without.post("/provision/claim", {
          credential: "x",
          email: "a@example.test",
          password: "synthetic long password",
        })
      ).status,
      404,
    );
    const { post } = client(
      createAuthInstance({
        site,
        database: db,
        mail,
        env,
        provisioning: ids.provisioning,
      }),
    );
    const unknown = await post("/provision/claim", {
      credential: "unknown",
      email: "a@example.test",
      password: "synthetic long password",
    });
    assert.equal(unknown.status, 401);
    assert.equal((await unknown.json()).code, CLAIM_ERRORS.invalid);
    assert.equal(cookie(unknown), "");
    const foreign = await post(
      "/provision/claim",
      {
        credential: "unknown",
        email: "a@example.test",
        password: "synthetic long password",
      },
      { origin: "https://foreign.example.test" },
    );
    assert.equal(foreign.status, 403);
    for (const password of ["", "x".repeat(129)]) {
      const refused = await post("/provision/claim", {
        credential: "unknown",
        email: "a@example.test",
        password,
      });
      assert.equal(refused.status, 400, "the one password rule");
    }
  } finally {
    await pg.close();
  }
});

test("a code-only identity gets its first password, and a second identity links only on that password", async () => {
  const { pg, db } = await database();
  try {
    const mail = { configured: false, send: async () => {} };
    const ids = product();
    await db.insert(authSchema.user).values([
      { id: "code-only-staff", email: "staff@aoz.invalid", name: "Staff" },
      { id: "code-only-resident", email: "resident@aoz.invalid", name: "" },
      {
        id: "invited",
        email: "invited@example.test",
        name: "Invited",
        emailVerified: false,
      },
    ]);
    ids.add("STAFF-CODE", "code-only-staff");
    ids.add("RESIDENT-CODE", "code-only-resident");
    ids.add("INVITE-LINK", "invited", { singleUse: true });
    ids.add("UNLINKABLE", "code-only-resident", { linkable: false });
    const auth = createAuthInstance({
      site,
      database: db,
      mail,
      env,
      provisioning: ids.provisioning,
    });
    const { post, session } = client(auth);
    const claim = (credential, email, password) =>
      post("/provision/claim", { credential, email, password });

    assert.equal(
      (
        await claim(
          "STAFF-CODE",
          "nobody@aoz.invalid",
          "synthetic staff password",
        )
      ).status,
      403,
      "an undeliverable address is never a sign-in address",
    );

    const first = await claim(
      "STAFF-CODE",
      "Ada@Example.test",
      "synthetic staff password",
    );
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), {
      success: true,
      status: "signed_in",
      userId: "code-only-staff",
    });
    assert.equal((await session(cookie(first))).user.id, "code-only-staff");
    const [staff] = await db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.id, "code-only-staff"));
    assert.equal(staff.email, "ada@example.test");
    assert.equal(staff.emailVerified, false, "a typed address is not verified");
    const [credential] = await db
      .select()
      .from(authSchema.account)
      .where(eq(authSchema.account.userId, "code-only-staff"));
    assert.equal(credential.providerId, "credential");
    assert.notEqual(credential.password, "synthetic staff password");

    const again = await claim(
      "STAFF-CODE",
      "ada@example.test",
      "synthetic staff password",
    );
    assert.equal(again.status, 409);
    assert.equal((await again.json()).code, CLAIM_ERRORS.alreadyClaimed);

    const unlinkable = await claim(
      "UNLINKABLE",
      "ada@example.test",
      "synthetic staff password",
    );
    assert.equal((await unlinkable.json()).code, CLAIM_ERRORS.emailTaken);

    const wrong = await claim(
      "RESIDENT-CODE",
      "ada@example.test",
      "not the existing password",
    );
    assert.equal(wrong.status, 401);
    assert.equal((await wrong.json()).code, CLAIM_ERRORS.linkPasswordMismatch);
    assert.equal(cookie(wrong), "");
    assert.ok(!ids.calls.some(([kind]) => kind === "link"));

    const linked = await claim(
      "RESIDENT-CODE",
      "ada@example.test",
      "synthetic staff password",
    );
    assert.equal(linked.status, 200);
    assert.equal((await linked.json()).userId, "code-only-staff");
    assert.equal((await session(cookie(linked))).user.id, "code-only-staff");
    assert.deepEqual(
      ids.calls.filter(([kind]) => kind !== "release").slice(-2),
      [
        ["link", "RESIDENT-CODE", "code-only-staff"],
        ["complete", "RESIDENT-CODE", "code-only-staff"],
      ],
    );
    assert.equal(
      (
        await db
          .select()
          .from(authSchema.account)
          .where(eq(authSchema.account.userId, "code-only-resident"))
      ).length,
      0,
      "linking never gives the placeholder user a credential",
    );

    const needsRecovery = await claim(
      "STAFF-CODE-2",
      "invited@example.test",
      "synthetic long password",
    );
    assert.equal(needsRecovery.status, 401, "unknown proof");
    ids.add("SECOND-CODE", "code-only-resident");
    const occupied = await claim(
      "SECOND-CODE",
      "invited@example.test",
      "synthetic long password",
    );
    assert.equal(occupied.status, 409);
    assert.equal(
      (await occupied.json()).code,
      CLAIM_ERRORS.emailNeedsRecovery,
      "an invited account's mailbox, not a typed password, proves it",
    );

    const invited = await claim(
      "INVITE-LINK",
      "invited@example.test",
      "synthetic invited password",
    );
    assert.equal(invited.status, 200);
    assert.ok(
      ids.calls.some((c) => c[0] === "complete" && c[1] === "INVITE-LINK"),
    );
    const reused = await claim(
      "INVITE-LINK",
      "invited@example.test",
      "synthetic invited password",
    );
    assert.equal(reused.status, 401, "a taken single-use proof is gone");
    const signIn = await post("/sign-in/email", {
      email: "invited@example.test",
      password: "synthetic invited password",
    });
    assert.equal(signIn.status, 200);
  } finally {
    await pg.close();
  }
});

test("a failed claim gives back a single-use proof and never moves a verified address", async () => {
  const { pg, db } = await database();
  try {
    const ids = product();
    await db.insert(authSchema.user).values({
      id: "verified-invite",
      email: "verified@example.test",
      name: "",
      emailVerified: true,
    });
    ids.add("LINK", "verified-invite", { singleUse: true });
    const { post } = client(
      createAuthInstance({
        site,
        database: db,
        mail: { configured: false, send: async () => {} },
        env,
        provisioning: ids.provisioning,
      }),
    );
    const moved = await post("/provision/claim", {
      credential: "LINK",
      email: "other@example.test",
      password: "synthetic long password",
    });
    assert.equal(moved.status, 409);
    assert.equal((await moved.json()).code, CLAIM_ERRORS.verifiedEmailMismatch);
    assert.deepEqual(ids.calls, [["release", "LINK"]]);
    const kept = await post("/provision/claim", {
      credential: "LINK",
      email: "verified@example.test",
      password: "synthetic long password",
      name: "Verified Person",
    });
    assert.equal(kept.status, 200, "the released proof still works");
    const [row] = await db.select().from(authSchema.user);
    assert.equal(row.emailVerified, true, "the same address stays verified");
    assert.equal(row.name, "Verified Person");
  } finally {
    await pg.close();
  }
});

test("with mail, a claim sends the link that signs them in, and no session before it", async () => {
  const { pg, db } = await database();
  try {
    const sent = [];
    const mail = {
      configured: true,
      send: async (kind, to, url) => sent.push({ kind, to, url }),
    };
    const ids = product();
    await db.insert(authSchema.user).values({
      id: "code-only",
      email: "code@aoz.invalid",
      name: "",
    });
    ids.add("CODE", "code-only");
    const auth = createAuthInstance({
      site,
      database: db,
      mail,
      env: { ...env, NODE_ENV: "production" },
      provisioning: ids.provisioning,
    });
    const { post, session } = client(auth);
    const claimed = await post("/provision/claim", {
      credential: "CODE",
      email: "mailbox@example.test",
      password: "synthetic mailbox password",
    });
    assert.equal(claimed.status, 200);
    assert.equal((await claimed.json()).status, "verify_email");
    assert.equal(
      cookie(claimed),
      "",
      "no session before the mailbox is proved",
    );
    assert.deepEqual(
      sent.map(({ kind, to }) => [kind, to]),
      [["verify", "mailbox@example.test"]],
    );

    const refused = await post("/sign-in/email", {
      email: "mailbox@example.test",
      password: "synthetic mailbox password",
    });
    assert.equal(refused.status, 403);
    assert.equal((await refused.json()).code, "EMAIL_NOT_VERIFIED");

    const verified = await auth.handler(new Request(sent[0].url));
    assert.ok(verified.status === 200 || verified.status === 302);
    assert.equal((await session(cookie(verified))).user.id, "code-only");
  } finally {
    await pg.close();
  }
});

test("a used reset link verifies the address it was sent to, and only that one", async () => {
  const { pg, db } = await database();
  try {
    const sent = [];
    const mail = {
      configured: true,
      send: async (kind, to, url) => sent.push({ kind, to, url }),
    };
    // Imported shapes: an invited account with no password, and one with a
    // legacy password whose address was never verified.
    await db.insert(authSchema.user).values([
      { id: "invited", email: "invited@example.test", name: "" },
      { id: "moved", email: "before@example.test", name: "" },
    ]);
    const auth = createAuthInstance({
      site,
      database: db,
      mail,
      env: { ...env, NODE_ENV: "production" },
    });
    const { post, session } = client(auth);
    const reset = async (email, password, beforeUse) => {
      await post("/request-password-reset", {
        email,
        redirectTo: site.url + "/reset",
      });
      const token = new URL(sent.at(-1).url).pathname.split("/").at(-1);
      await beforeUse?.();
      return post("/reset-password", { token, newPassword: password });
    };

    assert.equal(
      (await reset("invited@example.test", "synthetic first password")).status,
      200,
    );
    const [invited] = await db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.id, "invited"));
    assert.equal(invited.emailVerified, true);
    const signIn = await post("/sign-in/email", {
      email: "invited@example.test",
      password: "synthetic first password",
    });
    assert.equal(signIn.status, 200, "recovery leaves a usable sign-in");
    assert.equal((await session(cookie(signIn))).user.id, "invited");

    const changed = await reset(
      "before@example.test",
      "synthetic other password",
      () =>
        db
          .update(authSchema.user)
          .set({ email: "after@example.test" })
          .where(eq(authSchema.user.id, "moved")),
    );
    assert.equal(changed.status, 200);
    const [moved] = await db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.id, "moved"));
    assert.equal(
      moved.emailVerified,
      false,
      "a link to the old address does not verify the new one",
    );

    const bad = await post("/reset-password", {
      token: "not-a-token",
      newPassword: "synthetic other password",
    });
    assert.equal(bad.status, 400);
    assert.equal(
      (await db.select().from(authSchema.verification)).filter((v) =>
        v.identifier.startsWith("accountkit-reset-address:"),
      ).length,
      0,
      "used markers are removed",
    );
  } finally {
    await pg.close();
  }
});
