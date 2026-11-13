import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { signInMethods } from "../dist/auth/methods.js";
import { SignInForm, SignUpForm } from "../dist/auth/react.js";
import { authLabelsFor } from "../dist/auth/translations.js";

const GITHUB = { GITHUB_CLIENT_ID: "app", GITHUB_CLIENT_SECRET: "secret" };
const client = { signIn: {}, signUp: {} };

test("a product's own GitHub app shows only when the product asked for it", () => {
  assert.equal(
    signInMethods(GITHUB, false).github,
    false,
    "the two variables alone offer nothing",
  );
  assert.equal(
    signInMethods(GITHUB, false, { githubSignIn: true }).github,
    true,
  );
  assert.equal(
    signInMethods({}, false, { githubSignIn: true }).github,
    false,
    "both variables, or nothing",
  );
});

test("the screens draw it beside OrangeCat, in the page's language", () => {
  const methods = signInMethods(
    {
      ...GITHUB,
      ORANGECAT_OAUTH_CLIENT_ID: "a",
      ORANGECAT_OAUTH_CLIENT_SECRET: "b",
    },
    false,
    { githubSignIn: true },
  );
  const words = (html) => html.replace(/<[^<>]*>/g, "\n");
  const de = authLabelsFor("de");
  const signIn = words(
    renderToStaticMarkup(
      createElement(SignInForm, {
        client,
        methods,
        labels: de,
        next: "/",
        signInPath: "/de/sign-in",
        signUpLink: null,
      }),
    ),
  );
  assert.ok(
    signIn.indexOf("Weiter mit OrangeCat") <
      signIn.indexOf("Weiter mit GitHub"),
  );
  const signUp = words(
    renderToStaticMarkup(
      createElement(SignUpForm, {
        client,
        methods,
        next: "/",
        signUpPath: "/sign-up",
        signInLink: null,
      }),
    ),
  );
  assert.match(signUp, /Continue with GitHub/);
  const without = renderToStaticMarkup(
    createElement(SignInForm, {
      client,
      methods: signInMethods(GITHUB, false),
      next: "/",
      signInPath: "/sign-in",
      signUpLink: null,
    }),
  );
  assert.doesNotMatch(
    without,
    /GitHub/,
    "no GitHub button without githubSignIn",
  );
});

test("GitHub is offered once: the shared button names the other providers", async () => {
  const { signinButtonLabel, signinProvidersBeside } =
    await import("../dist/auth/labels.js");
  const en = authLabelsFor("en");
  assert.deepEqual(
    signinProvidersBeside(["Google", "GitHub"], { github: true }),
    ["Google"],
  );
  assert.deepEqual(
    signinProvidersBeside(["Google", "GitHub"], { github: false }),
    ["Google", "GitHub"],
    "without the product's own GitHub button the shared one still names it",
  );
  assert.deepEqual(
    signinProvidersBeside(["GitHub"], { github: true }),
    ["GitHub"],
    "a button has to say where it leads",
  );
  assert.equal(signinProvidersBeside(undefined, { github: true }), undefined);

  // On the screen: one button says GitHub, not two.
  const methods = {
    ...signInMethods(
      {
        ...GITHUB,
        ORANGECAT_OAUTH_CLIENT_ID: "a",
        ORANGECAT_OAUTH_CLIENT_SECRET: "b",
      },
      false,
      { githubSignIn: true },
    ),
    signin: true,
    signinProviders: ["Google", "GitHub"],
  };
  const html = renderToStaticMarkup(
    createElement(SignInForm, {
      client,
      methods,
      labels: en,
      next: "/",
      signInPath: "/sign-in",
      signUpLink: null,
    }),
  );
  const text = html.replace(/<[^<>]*>/g, "\n").replace(/&nbsp;|\u00a0/g, " ");
  assert.equal((text.match(/GitHub/g) ?? []).length, 1, text);
  assert.ok(
    text.includes(signinButtonLabel(en, ["Google"]).replace(/\u00a0/g, " ")),
  );
});
