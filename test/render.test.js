// The menu renders on the server (Next RSC/SSR) — a component that cannot
// render without a browser breaks every page it is put on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountMenu } from "../dist/index.js";

const noop = () => {};

test("the trigger names the person, announces a menu, and starts closed", () => {
  const html = renderToStaticMarkup(
    h(AccountMenu, { user: { name: "Cato" }, onSignOut: noop }),
  );
  assert.match(html, /aria-haspopup="menu"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-label="Account: Cato"/);
  assert.match(html, />C</, "initials drawn");
  assert.ok(!/role="menu"/.test(html), "closed on first render");
});

test("no name and no photo: a person glyph, not a letter from the email", () => {
  const html = renderToStaticMarkup(
    h(AccountMenu, { user: { email: "butaeff@gmail.com" }, onSignOut: noop }),
  );
  assert.match(html, /class="acct-glyph"/);
  assert.ok(!/>B</.test(html));
});

test("a photo is drawn when there is one", () => {
  const html = renderToStaticMarkup(
    h(AccountMenu, {
      user: { name: "Cato", image: "https://x/a.png" },
      onSignOut: noop,
    }),
  );
  assert.match(
    html,
    /<img[^>]*class="acct-avatar"[^>]*src="https:\/\/x\/a.png"/,
  );
});

test("labels are translatable (heidi is not in English)", () => {
  const html = renderToStaticMarkup(
    h(AccountMenu, {
      user: { name: "Cato" },
      onSignOut: noop,
      labels: { trigger: "Konto: {name}" },
    }),
  );
  assert.match(html, /aria-label="Konto: Cato"/);
});

test("the stylesheet guarantees 44px targets and a panel that fits a phone", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /--acct-target:\s*2\.75rem/, "44px");
  assert.match(
    css,
    /\.acct-trigger\s*\{[^}]*block-size:\s*var\(--acct-target\)/,
  );
  assert.match(
    css,
    /\.acct-row\s*\{[^}]*min-block-size:\s*var\(--acct-target\)/,
  );
  assert.match(css, /\.acct-panel\s*\{[^}]*inline-size:\s*min\([^)]*100vw/);
});

test("defaults sit at zero specificity so an app's own variables win", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /:where\(:root\)\s*\{/);
});

// The sign-in error screen. loki, skif and substrata showed Auth.js's bare
// "Error"; heidi's "Try again" went home. Try again must RESTART sign-in.
test("SignInError: Try again posts to the retry action, not home", async () => {
  const { SignInError } = await import("../dist/index.js");
  const html = renderToStaticMarkup(
    h(SignInError, {
      error: "OAuthCallbackError",
      retry: "/sign-in?from=%2Fsettings",
      home: "/",
    }),
  );
  assert.match(
    html,
    /<a class="acct-signin-button [^"]*" href="\/sign-in\?from=%2Fsettings">Try again</,
  );
  assert.match(html, /Sign-in did not finish/);
  assert.ok(
    !/OAuthCallbackError/.test(html),
    "the provider's code is never shown",
  );
});

test("SignInError: a server-action retry renders a form with its fields", async () => {
  const { SignInError } = await import("../dist/index.js");
  const html = renderToStaticMarkup(
    h(SignInError, { retry: async () => {}, retryFields: { from: "/a" } }),
  );
  assert.match(html, /<form/);
  assert.match(html, /<input type="hidden" name="from" value="\/a"\/>/);
  assert.match(
    html,
    /<button type="submit" class="acct-signin-button[^"]*">Try again</,
  );
});

test("SignInError: no retry when sign-in is not configured; denial says so", async () => {
  const { SignInError, signInErrorKind } = await import("../dist/index.js");
  const config = renderToStaticMarkup(
    h(SignInError, { error: "Configuration", retry: "/sign-in" }),
  );
  assert.ok(!/Try again/.test(config));
  assert.equal(signInErrorKind("AccessDenied"), "denied");
  assert.equal(signInErrorKind("Verification"), "failed");
  assert.equal(signInErrorKind(undefined), "failed");
});
