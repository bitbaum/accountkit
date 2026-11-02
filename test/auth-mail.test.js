import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuthMailer } from "../dist/auth/mail.js";

test("shared account mail reads deployment settings lazily and uses the app reply address", async () => {
  let values = {};
  const mail = createAuthMailer({
    site: { title: "Example", url: "https://example.orangecat.ch" },
    env: () => values,
  });
  assert.equal(mail.configured, false);
  values = { RESEND_API_KEY: "re_abcdefghijklmnopqrstuvwxyz1234567890" };
  assert.equal(mail.configured, true);
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return Response.json({ id: "test-mail" });
  };
  try {
    const url =
      "https://example.orangecat.ch/api/auth/reset-password/test?callbackURL=%2Fsign-in";
    await mail.send("reset", "ada@example.ch", url);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body.to, ["ada@example.ch"]);
    assert.equal(calls[0].body.reply_to, "hello@example.orangecat.ch");
    assert.ok(calls[0].body.text.includes(url));
    assert.match(calls[0].body.subject, /Example/);
    await mail.send(
      "reset",
      "ada@example.ch",
      "https://attacker.example/reset",
    );
    await mail.send("reset", "ada@example.ch", "invalid-url");
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = real;
  }
});

test("a product's own template, its own mail for one kind, and no mail to a placeholder", async () => {
  const site = { title: "Example", url: "https://example.orangecat.ch" };
  const env = () => ({
    RESEND_API_KEY: "re_abcdefghijklmnopqrstuvwxyz1234567890",
  });
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return Response.json({ id: "test-mail" });
  };
  try {
    const link = `${site.url}/api/auth/magic-link/verify?token=t&callbackURL=%2Fde%2Faccount`;
    const plain = createAuthMailer({
      site,
      env,
      render: (kind, url) => ({ subject: `de ${kind}`, text: url }),
    });
    assert.equal(
      plain.codes,
      false,
      "a template that does not say it prints the code gets none",
    );
    const templated = createAuthMailer({
      site,
      env,
      codes: true,
      render: (kind, url, extra) => ({
        subject: `Anmelden (${kind})`,
        text: `${url}\nCode: ${extra.code ?? "-"}`,
        html: `<p><a href="${url}">Anmelden</a> ${extra.code ?? ""}</p>`,
      }),
    });
    assert.equal(templated.codes, true);
    await templated.send("magicLink", "ada@example.ch", link, {
      code: "123456",
    });
    assert.equal(calls.at(-1).subject, "Anmelden (magicLink)");
    assert.match(calls.at(-1).text, /Code: 123456/);
    assert.match(calls.at(-1).html, /123456/);
    await templated.send(
      "magicLink",
      "ada@example.ch",
      "https://attacker.example/x",
      { code: "1" },
    );
    assert.equal(
      calls.length,
      1,
      "the origin check still applies to a template",
    );

    const own = [];
    const evig = createAuthMailer({
      site,
      env,
      own: {
        verify: async (to) => {
          own.push(to);
          return to !== "nocode@example.ch";
        },
      },
    });
    assert.equal(evig.codes, true, "the shared template prints the code");
    await evig.send(
      "verify",
      "ada@example.ch",
      `${site.url}/api/auth/verify-email?token=t`,
    );
    assert.deepEqual(own, ["ada@example.ch"]);
    assert.equal(
      calls.length,
      1,
      "the product's own mail replaced the shared one",
    );
    await evig.send(
      "verify",
      "nocode@example.ch",
      `${site.url}/api/auth/verify-email?token=t`,
    );
    assert.equal(
      calls.length,
      2,
      "when its own mail cannot be sent, the shared one is",
    );
    assert.match(calls.at(-1).subject, /Confirm your email/);

    await evig.send(
      "reset",
      "123@orangecat.invalid",
      `${site.url}/reset?token=t`,
    );
    assert.equal(
      calls.length,
      2,
      "nothing is sent to an address that cannot receive mail",
    );
  } finally {
    globalThis.fetch = real;
  }
});
