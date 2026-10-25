import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { pushSchema } from "drizzle-kit/api";
import { createAuthInstance } from "../dist/auth/server.js";
import { factorDestination } from "../dist/auth/factor.js";
import * as schema from "../dist/auth/schema.js";
import { otpForURI } from "./totp-helper.js";

test("factor redirect keeps locale/return path and removes bearer values and foreign origins", () => {
  const target = new URL(
    factorDestination(
      "https://factor.example.test",
      "/de/sign-in?error=oidc&token=never-carry&code=never-carry&state=never-carry",
      "/de/account?tab=security",
    ),
  );
  assert.equal(target.pathname, "/de/sign-in");
  assert.equal(target.searchParams.get("twoFactor"), "1");
  assert.equal(target.searchParams.get("next"), "/de/account?tab=security");
  for (const key of ["error", "token", "code", "state"])
    assert.equal(target.searchParams.has(key), false);
  const foreign = new URL(
    factorDestination(
      "https://factor.example.test",
      "https://foreign.test/",
      "//foreign.test/",
    ),
  );
  assert.equal(foreign.origin, "https://factor.example.test");
  assert.equal(foreign.pathname, "/sign-in");
  assert.equal(foreign.searchParams.get("next"), "/");
});

test("an email link cannot skip an enabled second factor; native password and non-MFA flows still work", async () => {
  const pg = new PGlite();
  try {
    const db = drizzle(pg, { schema: schema.authSchema });
    await (await pushSchema(schema.authSchema, db)).apply();
    const site = {
      url: "https://factor.example.test",
      title: "Factor fixture",
      slug: "factor",
    };
    const sent = [];
    const auth = createAuthInstance({
      site,
      database: db,
      env: {
        NODE_ENV: "test",
        BETTER_AUTH_SECRET:
          "synthetic-factor-fixture-secret-with-more-than-32-characters",
      },
      mail: {
        configured: true,
        send: async (kind, to, url) => {
          sent.push({ kind, url });
        },
      },
    });
    const cookies = new Map();
    const call = async (path, body) => {
      const response = await auth.handler(
        new Request(new URL(path, site.url), {
          method: body === undefined ? "GET" : "POST",
          headers: {
            origin: site.url,
            "content-type": "application/json",
            cookie: [...cookies]
              .map(([name, value]) => `${name}=${value}`)
              .join("; "),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
      for (const header of response.headers.getSetCookie()) {
        const pair = header.split(";")[0],
          index = pair.indexOf("=");
        cookies.set(pair.slice(0, index), pair.slice(index + 1));
      }
      return response;
    };
    const post = (path, body = {}) => call("/api/auth" + path, body);
    const session = () =>
      call("/api/auth/get-session").then((response) => response.json());
    const credentials = {
      email: "factor-fixture@example.test",
      password: "a synthetic factor passphrase",
    };
    assert.equal(
      (await post("/sign-up/email", { ...credentials, name: "Fixture" }))
        .status,
      200,
    );
    assert.equal(sent.at(-1).kind, "verify");
    assert.equal((await call(sent.at(-1).url)).status, 302);
    const originalId = (await session()).user.id;
    const enabled = await post("/two-factor/enable", {
      password: credentials.password,
    });
    assert.equal(enabled.status, 200);
    const setup = await enabled.json();
    assert.equal(
      (
        await post("/two-factor/verify-totp", {
          code: otpForURI(setup.totpURI),
        })
      ).status,
      200,
    );
    await post("/sign-out");
    assert.equal(
      (
        await post("/sign-in/magic-link", {
          email: credentials.email,
          callbackURL: "/de/account?tab=security",
          errorCallbackURL: "/de/sign-in?error=mail&token=never-carry",
        })
      ).status,
      200,
    );
    assert.equal(sent.at(-1).kind, "magicLink");
    const link = sent.at(-1).url;
    const challenged = await call(link);
    assert.equal(challenged.status, 302);
    const destination = new URL(challenged.headers.get("location"));
    assert.equal(destination.pathname, "/de/sign-in");
    assert.equal(destination.searchParams.get("twoFactor"), "1");
    assert.equal(
      destination.searchParams.get("next"),
      "/de/account?tab=security",
    );
    assert.ok(
      (await session()) === null,
      "link alone must not create an authenticated session",
    );
    assert.equal(
      (
        await post("/two-factor/verify-totp", {
          code: otpForURI(setup.totpURI),
        })
      ).status,
      200,
    );
    assert.ok(
      (await session())?.user.id === originalId,
      "second factor restores the same identity",
    );
    await post("/sign-out");
    await call(link);
    assert.ok(
      (await session()) === null,
      "consumed link cannot create a session again",
    );
    const password = await post("/sign-in/email", credentials);
    assert.equal(password.status, 200);
    assert.equal((await password.json()).twoFactorRedirect, true);
    assert.ok(
      (await session()) === null,
      "password still requires its second factor",
    );
    assert.equal(
      (
        await post("/two-factor/verify-totp", {
          code: otpForURI(setup.totpURI),
        })
      ).status,
      200,
    );
    assert.equal(
      (await post("/two-factor/disable", { password: credentials.password }))
        .status,
      200,
    );
    await post("/sign-out");
    await post("/sign-in/magic-link", {
      email: credentials.email,
      callbackURL: "/account",
    });
    const ordinary = await call(sent.at(-1).url);
    assert.equal(ordinary.status, 302);
    assert.equal(
      new URL(ordinary.headers.get("location")).pathname,
      "/account",
    );
    assert.ok(
      (await session())?.user.id === originalId,
      "non-MFA link sign-in remains supported",
    );
  } finally {
    await pg.close();
  }
});
