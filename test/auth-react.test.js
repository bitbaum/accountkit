// The account screens render every method a deployment offers, in the words
// the product passes, and nothing it does not offer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import {
  SignInForm,
  SignUpForm,
  AccountPanel,
  DEFAULT_AUTH_LABELS,
} from "../dist/auth/react.js";
import { authErrorText, fill } from "../dist/auth/index.js";

const client = new Proxy(
  {},
  {
    get: () =>
      new Proxy(() => Promise.resolve({}), {
        get: () => () => Promise.resolve({}),
      }),
  },
);
const all = {
  password: true,
  passkey: true,
  twoFactor: true,
  magicLink: true,
  verifyEmail: true,
  signin: true,
  orangecat: true,
};
const none = { ...all, magicLink: false, signin: false, orangecat: false };

test("sign-in offers exactly the switched-on methods", () => {
  const full = renderToString(
    h(SignInForm, {
      client,
      methods: all,
      next: "/a",
      signInPath: "/s",
      signUpLink: "x",
    }),
  );
  for (const label of [
    DEFAULT_AUTH_LABELS.withSignin,
    DEFAULT_AUTH_LABELS.withOrangecat,
    DEFAULT_AUTH_LABELS.withPasskey,
    DEFAULT_AUTH_LABELS.withLink,
  ]) {
    assert.ok(full.includes(label), label);
  }
  const bare = renderToString(
    h(SignInForm, {
      client,
      methods: none,
      next: "/a",
      signInPath: "/s",
      signUpLink: "x",
    }),
  );
  for (const label of [
    DEFAULT_AUTH_LABELS.withSignin,
    DEFAULT_AUTH_LABELS.withOrangecat,
    DEFAULT_AUTH_LABELS.withLink,
  ]) {
    assert.ok(!bare.includes(label), label);
  }
  assert.ok(bare.includes('type="password"'));
});

test("the product's own words and classes are used", () => {
  const labels = {
    ...DEFAULT_AUTH_LABELS,
    signIn: "Anmelden",
    createAccount: "Konto erstellen",
  };
  const html = renderToString(
    h(SignUpForm, {
      client,
      methods: none,
      labels,
      classes: { button: "my-btn" },
      next: "/a",
      signUpPath: "/u",
      signInLink: "x",
    }),
  );
  assert.ok(html.includes("Konto erstellen"));
  assert.ok(html.includes('class="my-btn"'));
  assert.ok(html.includes('minLength="8"'));
});

test("signing up asks for an email and one password, nothing else", () => {
  const signUp = (methods) =>
    renderToString(
      h(SignUpForm, {
        client,
        methods,
        next: "/a",
        signUpPath: "/u",
        signInLink: "x",
      }),
    );
  const bare = signUp(none);
  assert.equal((bare.match(/<input/g) ?? []).length, 2, "email + one password");
  assert.ok(!bare.includes(DEFAULT_AUTH_LABELS.displayName));
  assert.ok(
    !bare.includes(DEFAULT_AUTH_LABELS.orEmail),
    "no divider with nothing above it",
  );
  assert.ok(
    signUp(all).includes(DEFAULT_AUTH_LABELS.orEmail),
    "a divider under the providers",
  );
});

test("the account page names the methods a person has", () => {
  const html = renderToString(
    h(AccountPanel, {
      client,
      methods: all,
      user: {
        name: "Ada",
        email: null,
        emailVerified: false,
        role: "customer",
        twoFactorEnabled: false,
      },
      linked: ["credential"],
      accountPath: "/account",
      homePath: "/",
    }),
  );
  assert.ok(html.includes(DEFAULT_AUTH_LABELS.account.methodPassword));
  assert.ok(
    html.includes(
      fill(DEFAULT_AUTH_LABELS.account.link, {
        method: DEFAULT_AUTH_LABELS.withOrangecat,
      }),
    ),
  );
  assert.ok(html.includes(DEFAULT_AUTH_LABELS.account.noEmail));
});

test("errors are sentences, never a provider's raw message", () => {
  assert.equal(
    authErrorText(DEFAULT_AUTH_LABELS, { code: "INVALID_EMAIL_OR_PASSWORD" }),
    DEFAULT_AUTH_LABELS.errors.INVALID_EMAIL_OR_PASSWORD,
  );
  assert.equal(
    authErrorText(DEFAULT_AUTH_LABELS, { status: 429 }),
    DEFAULT_AUTH_LABELS.errors.rateLimited,
  );
  assert.equal(
    authErrorText(DEFAULT_AUTH_LABELS, {
      code: "WEIRD",
      message: "secret detail",
    }),
    DEFAULT_AUTH_LABELS.errors.generic,
  );
  assert.equal(authErrorText(DEFAULT_AUTH_LABELS, null), null);
});
