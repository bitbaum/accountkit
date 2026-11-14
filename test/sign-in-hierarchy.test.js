/**
 * One thing the sign-in screen asks for. Loki's sign-in at 390px
 * (2026-11-13) was nine outlined boxes of equal weight; "Email me a sign-in
 * link instead" and "Forgot your password?" read as two more ways in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { SignInForm, DEFAULT_AUTH_CLASSES } from "../dist/auth/react.js";
import { DEFAULT_AUTH_LABELS } from "../dist/auth/labels.js";

const client = {
  signIn: {},
  signUp: {},
  requestPasswordReset: async () => ({}),
  resetPassword: async () => ({}),
};
const methods = {
  emailPassword: true,
  magicLink: true,
  passwordReset: true,
  passkey: true,
  orangecat: false,
  signin: false,
  github: false,
};

const render = (extra = {}) =>
  renderToStaticMarkup(
    createElement(SignInForm, {
      client,
      methods,
      next: "/",
      signInPath: "/sign-in",
      signUpLink: null,
      ...extra,
    }),
  );

/** The class of the button whose visible words are `label`. */
const classOf = (html, label) => {
  for (const [, cls, inner] of html.matchAll(
    /<button[^>]*class="([^"]*)"[^>]*>(.*?)<\/button>/g,
  )) {
    const text = inner.replace(/<[^<>]*>/g, "").replace(/\u00a0|&nbsp;/g, " ");
    if (text === label) return cls;
  }
  assert.fail(`no button reads "${label}"`);
};

const words = (s) => s;

test("the way round the form is text, the form's own action is the filled button", () => {
  const html = render();
  const L = DEFAULT_AUTH_LABELS;
  assert.equal(classOf(html, words(L.withLink)), "acct-auth-text-action");
  assert.equal(
    classOf(html, words(L.recovery.forgot)),
    "acct-auth-text-action",
  );
  assert.equal(classOf(html, words(L.signIn)), "acct-auth-button");
  assert.equal(
    (html.match(/class="acct-auth-button"/g) ?? []).length,
    1,
    "one filled button",
  );
});

test("a product that names its own class for text actions gets it", () => {
  const html = render({ classes: { textAction: "my-text" } });
  assert.equal(classOf(html, words(DEFAULT_AUTH_LABELS.withLink)), "my-text");
  assert.equal(DEFAULT_AUTH_CLASSES.textAction, "acct-auth-text-action");
});

test("the stylesheet keeps a text action a full touch target", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const rule = /\.acct-auth-text-action \{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(rule, /min-height: var\(--acct-target\)/);
  assert.match(rule, /border: 0/);
});
