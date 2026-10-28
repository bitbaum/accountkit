import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import bcrypt from "bcryptjs";
import {
  createPasswordHasher,
  PASSWORD_HASH_PREFIX,
} from "../dist/auth/hash.js";

// A cheap cost keeps the test fast; the algorithm is the same.
const hasher = createPasswordHasher(bcrypt, 4);

test("every character of a long password counts", async () => {
  const stored = await hasher.hash("a".repeat(100) + "X");
  assert.ok(stored.startsWith(PASSWORD_HASH_PREFIX));
  assert.equal(
    (await hasher.verify("a".repeat(100) + "X", stored)).valid,
    true,
  );
  assert.equal(
    (await hasher.verify("a".repeat(100) + "Y", stored)).valid,
    false,
  );
  assert.equal((await hasher.verify("a".repeat(72), stored)).valid, false);
});

test("an old plain bcrypt hash still verifies and asks to be replaced", async () => {
  const legacy = await bcrypt.hash("old password", 4);
  const ok = await hasher.verify("old password", legacy);
  assert.deepEqual(ok, { valid: true, rehash: true });
  assert.deepEqual(await hasher.verify("wrong", legacy), {
    valid: false,
    rehash: false,
  });
  const upgraded = await hasher.hash("old password");
  assert.deepEqual(await hasher.verify("old password", upgraded), {
    valid: true,
    rehash: false,
  });
});

test("a missing hash or password never verifies", async () => {
  assert.equal((await hasher.verify("x", null)).valid, false);
  assert.equal((await hasher.verify("x", "")).valid, false);
  assert.equal((await hasher.verify(undefined, "$2b$04$abc")).valid, false);
});

test("the CommonJS build is the same hasher", async () => {
  const require = createRequire(import.meta.url);
  const cjs = require("@bitbaum/accountkit/auth/hash");
  const stored = await createPasswordHasher(bcrypt, 4).hash("same");
  assert.equal(
    (await cjs.createPasswordHasher(bcrypt, 4).verify("same", stored)).valid,
    true,
  );
});
