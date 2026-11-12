// returnPath from the browser-safe "." entry: a static page validates a
// return path without bundling the server-only "./orangecat" (node:crypto).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { returnPath } from "../dist/index.js";
import { returnPath as fromOrangecat } from "../dist/orangecat.js";

test("the same function as ./orangecat's", () => {
  assert.equal(returnPath, fromOrangecat);
});

test("same-origin paths pass through unchanged", () => {
  for (const path of ["/", "/studio", "/a/b?c=d&e=%2F#f", "/@cato"]) {
    assert.equal(returnPath(path), path);
  }
});

test("anything that could leave the origin falls back", () => {
  for (const hostile of [
    "//evil.example/x",
    "///evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "/a\\b",
    "https://evil.example/",
    "http://bitbaum.orangecat.ch/",
    "javascript:alert(1)",
    "evil.example",
    "",
    "/a\nb",
    "/a\rb",
    "/a\tb",
    "/\u0000",
    "/\u001f",
    undefined,
    null,
    42,
    ["/a"],
  ]) {
    assert.equal(returnPath(hostile), "/", JSON.stringify(hostile));
    assert.equal(returnPath(hostile, "/home"), "/home");
  }
});

test("the '.' entry stays browser-safe: no node: import reaches it", () => {
  for (const file of [
    "index.js",
    "paths.js",
    "AccountControl.js",
    "accountSummary.js",
  ]) {
    const js = readFileSync(
      new URL(`../dist/${file}`, import.meta.url),
      "utf8",
    );
    assert.ok(!/from\s+["']node:/.test(js), file);
    assert.ok(!/orangecat\.js/.test(js), file);
  }
});
