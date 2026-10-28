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
