import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import * as esm from "../dist/auth/password.js";

const require = createRequire(import.meta.url);

test("a CommonJS backend can require the one password rule, identical to the ESM build", () => {
  const cjs = require("@bitbaum/accountkit/auth/password");
  assert.equal(cjs.MIN_PASSWORD_LENGTH, esm.MIN_PASSWORD_LENGTH);
  assert.equal(cjs.MAX_PASSWORD_LENGTH, esm.MAX_PASSWORD_LENGTH);
  for (const value of ["", "a", "a".repeat(128), "a".repeat(129), 5, undefined])
    assert.equal(cjs.passwordProblem(value), esm.passwordProblem(value));
});

test("PasswordField is its own entry: one input with a show button, styled by the caller's classes", async () => {
  const { createElement: h } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { PasswordField } =
    await import("@bitbaum/accountkit/auth/password-field");
  const html = renderToStaticMarkup(
    h(PasswordField, {
      id: "pw",
      value: "",
      onChange() {},
      classes: { input: "mine" },
    }),
  );
  assert.match(
    html,
    /<input[^>]*id="pw"[^>]*type="password"|type="password"[^>]*id="pw"/,
  );
  assert.match(html, /class="mine"/);
  assert.match(html, /aria-label="Show password"/);
  assert.match(html, /maxLength="128"/);
});
