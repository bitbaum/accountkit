import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { pushSchema } from "drizzle-kit/api";
import { createAuthInstance } from "../dist/auth/server.js";
import { createAuthMailer, spacedCode } from "../dist/auth/mail.js";
import { closedCodePath } from "../dist/auth/sign-in-code.js";
import { authErrorText, DEFAULT_AUTH_LABELS } from "../dist/auth/labels.js";
import {
  authLabelsFor,
  AUTH_LABEL_LOCALES,
} from "../dist/auth/translations.js";
import * as schema from "../dist/auth/schema.js";
import { otpForURI } from "./totp-helper.js";

const site = {
  url: "https://code.example.test",
  title: "Code fixture",
  slug: "code",
};
const env = {
  NODE_ENV: "test",
  BETTER_AUTH_SECRET:
    "synthetic-code-fixture-secret-with-more-than-32-characters",
};

async function fixture({ codes }) {
  const pg = new PGlite();
  const db = drizzle(pg, { schema: schema.authSchema });
  await (await pushSchema(schema.authSchema, db)).apply();
  const sent = [];
  const auth = createAuthInstance({
    site,
    database: db,
    env,
    mail: {
      configured: true,
      codes,
      send: async (kind, to, url, extra) => {
        sent.push({ kind, to, url, code: extra?.code });
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
          cookie: [...cookies].map(([n, v]) => `${n}=${v}`).join("; "),
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
  const session = () => call("/api/auth/get-session").then((r) => r.json());
  return { pg, sent, post, call, session, cookies };
}

test("the sign-in link's email carries a code that signs in on the page that asked", async () => {
  const f = await fixture({ codes: true });
  try {
    const email = "code-person@example.test";
    const asked = await f.post("/sign-in/magic-link", {
      email,
      callbackURL: "/account",
    });
    assert.equal(asked.status, 200);
    assert.deepEqual(await asked.json(), { status: true, code: true });
    const mail = f.sent.at(-1);
    assert.equal(mail.kind, "magicLink");
    assert.match(mail.code, /^\d{6}$/);
    const wrong = mail.code === "000000" ? "111111" : "000000";
    const refused = await f.post("/sign-in/email-otp", { email, otp: wrong });
    assert.equal(refused.status, 400);
    assert.equal(
      authErrorText(DEFAULT_AUTH_LABELS, await refused.json()),
      DEFAULT_AUTH_LABELS.errors.INVALID_CODE,
    );
    assert.equal(await f.session(), null);
    const signed = await f.post("/sign-in/email-otp", {
      email,
      otp: mail.code,
    });
    assert.equal(signed.status, 200);
    const who = await f.session();
    assert.equal(who.user.email, email);
    assert.equal(who.user.emailVerified, true, "the code proves the address");
    await f.post("/sign-out");
    const again = await f.post("/sign-in/email-otp", { email, otp: mail.code });
    assert.equal(again.status, 400, "a code works once");
  } finally {
    await f.pg.close();
  }
});

test("three wrong tries end a code", async () => {
  const f = await fixture({ codes: true });
  try {
    const email = "guesser@example.test";
    await f.post("/sign-in/magic-link", { email, callbackURL: "/" });
    const { code } = f.sent.at(-1);
    const wrong = code === "123456" ? "654321" : "123456";
    for (let i = 0; i < 3; i++)
      await f.post("/sign-in/email-otp", { email, otp: wrong });
    const late = await f.post("/sign-in/email-otp", { email, otp: code });
    assert.ok(
      late.status >= 400,
      "the right code after three wrong ones is refused",
    );
    assert.equal(await f.session(), null);
  } finally {
    await f.pg.close();
  }
});

test("a code cannot skip an enabled second factor", async () => {
  const f = await fixture({ codes: true });
  try {
    const credentials = {
      email: "factor-code@example.test",
      password: "a synthetic code passphrase",
    };
    assert.equal(
      (await f.post("/sign-up/email", { ...credentials, name: "" })).status,
      200,
    );
    const enabled = await f.post("/two-factor/enable", {
      password: credentials.password,
    });
    const setup = await enabled.json();
    assert.equal(
      (
        await f.post("/two-factor/verify-totp", {
          code: otpForURI(setup.totpURI),
        })
      ).status,
      200,
    );
    const id = (await f.session()).user.id;
    await f.post("/sign-out");
    await f.post("/sign-in/magic-link", {
      email: credentials.email,
      callbackURL: "/",
    });
    const { code } = f.sent.at(-1);
    const challenged = await f.post("/sign-in/email-otp", {
      email: credentials.email,
      otp: code,
    });
    assert.equal(challenged.status, 200);
    assert.equal((await challenged.json()).twoFactorRedirect, true);
    assert.equal(await f.session(), null, "the code alone is not a session");
    assert.equal(
      (
        await f.post("/two-factor/verify-totp", {
          code: otpForURI(setup.totpURI),
        })
      ).status,
      200,
    );
    assert.equal((await f.session()).user.id, id);
  } finally {
    await f.pg.close();
  }
});

test("better-auth's other code endpoints stay closed: no code by itself, no reset by code", async () => {
  const f = await fixture({ codes: true });
  try {
    for (const path of [
      "/email-otp/send-verification-otp",
      "/email-otp/request-password-reset",
      "/email-otp/reset-password",
      "/email-otp/verify-email",
      "/email-otp/check-verification-otp",
      "/forget-password/email-otp",
    ]) {
      const r = await f.post(path, {
        email: "x@example.test",
        type: "sign-in",
        otp: "123456",
        password: "x",
      });
      assert.equal(r.status, 404, path);
    }
    assert.equal(f.sent.length, 0, "nothing was mailed");
    assert.equal(closedCodePath("/sign-in/email-otp"), false);
    assert.equal(closedCodePath("/email-otp/reset-password"), true);
  } finally {
    await f.pg.close();
  }
});

test("a mailer that cannot carry a code gets none, and no code endpoint is mounted", async () => {
  const f = await fixture({ codes: false });
  try {
    const asked = await f.post("/sign-in/magic-link", {
      email: "plain@example.test",
      callbackURL: "/",
    });
    assert.deepEqual(await asked.json(), { status: true });
    assert.equal(f.sent.at(-1).code, undefined);
    const r = await f.post("/sign-in/email-otp", {
      email: "plain@example.test",
      otp: "123456",
    });
    assert.equal(r.status, 404);
  } finally {
    await f.pg.close();
  }
});

test("the shared mailer says it carries codes and prints the code in the link's email only", async () => {
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    sent.push(JSON.parse(init.body));
    return Response.json({ id: "m_1" });
  };
  try {
    const mailer = createAuthMailer({
      site: { title: "Code fixture", url: site.url },
      env: () => ({
        RESEND_API_KEY: "re_unit_test_not_a_key",
        RESEND_FROM: "hello@code.example.test",
      }),
    });
    assert.equal(mailer.codes, true);
    await mailer.send(
      "magicLink",
      "p@example.test",
      `${site.url}/api/auth/magic-link/verify?token=t`,
      { code: "123456" },
    );
    await mailer.send("reset", "p@example.test", `${site.url}/reset?token=t`, {
      code: "123456",
    });
    assert.match(JSON.stringify(sent[0]), /123 456/);
    assert.doesNotMatch(JSON.stringify(sent[1]), /123 456/);
    assert.equal(spacedCode("123456"), "123 456");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("every shipped language says where the code goes and what the button does", () => {
  for (const locale of AUTH_LABEL_LOCALES) {
    const l = authLabelsFor(locale);
    assert.ok(l.codePrompt && /6/.test(l.codePrompt), locale);
    assert.ok(l.signInWithCode, locale);
  }
});
