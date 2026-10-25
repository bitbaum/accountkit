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
