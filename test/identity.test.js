// The identity rules, pure. Each is a mistake one of the two source apps made.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  displayNameFor,
  initialsFor,
  nextMenuIndex,
  secondaryLineFor,
  PLACEHOLDER_NAME,
} from "../dist/index.js";

test("the display name is the name the person chose", () => {
  assert.equal(
    displayNameFor({ name: "Cato", email: "butaeff@gmail.com" }),
    "Cato",
  );
});

test("no name: the handle, written as @handle", () => {
  assert.equal(displayNameFor({ handle: "cato" }), "@cato");
  assert.equal(displayNameFor({ handle: "@cato" }), "@cato", "never @@");
});

// OrangeCat's rule. `firstname.lastname@…` once came out as "Firstname
// Lastname" — a real name rebuilt from an address the person never displayed.
test("a name is NEVER reconstructed from the email address", () => {
  const shown = displayNameFor({ email: "firstname.lastname@example.com" });
  assert.equal(shown, PLACEHOLDER_NAME);
  assert.ok(!/firstname|lastname/i.test(shown));
});

// Loki's rule. "butaeff" → "B" tells the person nothing.
test("initials come from the name only — never from the email", () => {
  assert.equal(initialsFor({ name: "George Botsmann" }), "GB");
  assert.equal(initialsFor({ name: "Cato" }), "C");
  assert.equal(
    initialsFor({ email: "butaeff@gmail.com" }),
    null,
    "glyph, not a letter",
  );
  assert.equal(initialsFor({ name: "   " }), null);
});

test("initials take at most two words and survive non-Latin first letters", () => {
  assert.equal(initialsFor({ name: "Ana María García López" }), "AM");
  assert.equal(initialsFor({ name: "Émile Zola" }), "ÉZ");
});

test("the second identity line: @handle beside a name, else the email", () => {
  assert.equal(secondaryLineFor({ name: "Cato", handle: "cato" }), "@cato");
  assert.equal(secondaryLineFor({ name: "Cato", email: "c@x.ch" }), "c@x.ch");
  assert.equal(secondaryLineFor({ name: "Cato" }), null);
});

test("arrow keys wrap; Home and End jump; nothing to focus is -1", () => {
  assert.equal(
    nextMenuIndex(-1, "ArrowDown", 3),
    0,
    "first press lands on the first item",
  );
  assert.equal(nextMenuIndex(2, "ArrowDown", 3), 0, "wraps past the last");
  assert.equal(nextMenuIndex(0, "ArrowUp", 3), 2, "wraps past the first");
  assert.equal(nextMenuIndex(-1, "ArrowUp", 3), 2);
  assert.equal(nextMenuIndex(1, "Home", 3), 0);
  assert.equal(nextMenuIndex(1, "End", 3), 2);
  assert.equal(nextMenuIndex(0, "ArrowDown", 0), -1);
});
