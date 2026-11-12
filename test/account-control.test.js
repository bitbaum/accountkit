// AccountControl: the one header control for all three states, and the
// signed-out markup a static page prints without React. Loki and Heidi each
// wrote their own signed-out corner; this is the one they replace.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AccountControl,
  AccountMenu,
  accountSignInHtml,
} from "../dist/index.js";

const noop = () => {};

test("signed out: the markup is exactly accountSignInHtml's", () => {
  const signIn = { href: "/sign-in?from=%2Fstudio&x=1" };
  const html = renderToStaticMarkup(
    h(AccountControl, { state: null, signIn, onSignOut: noop }),
  );
  assert.equal(html, accountSignInHtml(signIn));
  assert.equal(
    html,
    '<a class="acct-signin" href="/sign-in?from=%2Fstudio&amp;x=1">Sign in</a>',
  );
});

test("signed out: one link, with the exact href, and the label given", () => {
  const signIn = {
    href: "https://loki.orangecat.ch/sign-in?next=%2Fstudio",
    label: "Anmelden",
  };
  const html = renderToStaticMarkup(
    h(AccountControl, { state: null, signIn, onSignOut: noop }),
  );
  assert.equal(html.match(/<a\b/g)?.length, 1);
  assert.match(
    html,
    /href="https:\/\/loki\.orangecat\.ch\/sign-in\?next=%2Fstudio"/,
  );
  assert.match(html, />Anmelden<\/a>$/);
  assert.equal(html, accountSignInHtml(signIn));
});

test("signed out: the label falls back to labels.signIn, then Sign in", () => {
  const html = renderToStaticMarkup(
    h(AccountControl, {
      state: null,
      signIn: { href: "/a" },
      labels: { signIn: "Se connecter" },
      onSignOut: noop,
    }),
  );
  assert.match(html, />Se connecter<\/a>/);
  assert.equal(html, accountSignInHtml({ href: "/a", label: "Se connecter" }));
  assert.match(accountSignInHtml({ href: "/a" }), />Sign in<\/a>/);
});

test("signed out: a hostile label and href are escaped, the same both ways", () => {
  for (const signIn of [
    { href: '/x"><script>alert(1)</script>', label: "<img src=x onerror=1>" },
    { href: "/a?b='c'&d=<e>", label: `Tom & "Jerry's"` },
    { href: "javascript:alert(1)", label: "Sign in" },
    { href: " \tJaVa\nScRiPt:alert(1)", label: "Sign in" },
  ]) {
    const html = renderToStaticMarkup(
      h(AccountControl, { state: null, signIn, onSignOut: noop }),
    );
    assert.equal(html, accountSignInHtml(signIn), JSON.stringify(signIn));
    assert.ok(!/<script|<img/i.test(html), html);
    assert.ok(!/javascript:/i.test(html.replace(/\s/g, "")), html);
    assert.equal(html.match(/<a\b/g)?.length, 1);
  }
  assert.equal(
    accountSignInHtml({ href: "javascript:alert(1)" }),
    '<a class="acct-signin" href="#">Sign in</a>',
  );
});

test("loading: aria-hidden, nothing focusable, no text", () => {
  const html = renderToStaticMarkup(
    h(AccountControl, {
      state: "loading",
      signIn: { href: "/sign-in" },
      onSignOut: noop,
    }),
  );
  assert.equal(html, '<span class="acct-pending" aria-hidden="true"></span>');
  assert.ok(!/<(a|button|input|select|textarea)\b|tabindex/i.test(html));
});

test("signed in: the same markup as AccountMenu with the same props", () => {
  const props = {
    onSignOut: noop,
    groups: [
      { id: "g", items: [{ id: "p", label: "Profile", href: "/profile" }] },
    ],
    labels: { trigger: "Konto: {name}" },
    align: "start",
    className: "site-account",
  };
  const user = { name: "George Botsmann", handle: "cato", image: "/me.png" };
  assert.equal(
    renderToStaticMarkup(
      h(AccountControl, { state: user, signIn: { href: "/x" }, ...props }),
    ),
    renderToStaticMarkup(h(AccountMenu, { user, ...props })),
  );
});

test("the stylesheet gives Sign in and the loading box the trigger's 44px", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(
    css,
    /\.acct-pending\s*\{[^}]*inline-size:\s*var\(--acct-target\)[^}]*block-size:\s*var\(--acct-target\)/,
  );
  assert.match(
    css,
    /\.acct-signin\s*\{[^}]*block-size:\s*var\(--acct-target\)/,
  );
});
