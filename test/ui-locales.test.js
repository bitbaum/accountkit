// The shared sign-in and OrangeCat are told the page's language (OIDC
// ui_locales), so a sign-in started on a German page is not English there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { uiLocalesFor } from "../dist/auth/react.js";

test("the product's locale is sent as written", () => {
  assert.equal(uiLocalesFor("de"), "de");
  assert.equal(uiLocalesFor("de-CH"), "de-CH");
  assert.equal(uiLocalesFor(" rm "), "rm");
});

test("without one, the page's <html lang> is sent", () => {
  const before = globalThis.document;
  globalThis.document = { documentElement: { lang: "it-CH" } };
  try {
    assert.equal(uiLocalesFor(), "it-CH");
    assert.equal(uiLocalesFor(undefined), "it-CH");
    assert.equal(uiLocalesFor("fr"), "fr");
  } finally {
    if (before === undefined) delete globalThis.document;
    else globalThis.document = before;
  }
});

test("nothing that is not a language tag is sent", () => {
  assert.equal(uiLocalesFor(), undefined); // no document on the server
  assert.equal(uiLocalesFor(""), undefined);
  assert.equal(uiLocalesFor("de&prompt=none"), undefined);
  assert.equal(uiLocalesFor("de CH"), undefined);
});
