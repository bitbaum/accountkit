// Every language carries every sentence the screens show, with the same
// placeholders — a missing key renders as "undefined" on someone's sign-in.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUTH_LABEL_LOCALES,
  DEFAULT_AUTH_LABELS,
  authLabelsFor,
} from "../dist/auth/index.js";

function leaves(value, path = "") {
  if (typeof value === "string") return [[path, value]];
  return Object.entries(value).flatMap(([k, v]) =>
    leaves(v, path ? `${path}.${k}` : k),
  );
}
const placeholders = (s) =>
  [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const reference = new Map(leaves(DEFAULT_AUTH_LABELS));

for (const locale of AUTH_LABEL_LOCALES) {
  test(`${locale} has every label, with the same placeholders`, () => {
    const got = new Map(leaves(authLabelsFor(locale)));
    for (const [key, english] of reference) {
      assert.ok(got.get(key), `${locale} is missing ${key}`);
      assert.deepEqual(
        placeholders(got.get(key)),
        placeholders(english),
        `${locale} ${key}`,
      );
    }
  });
}

test("German is written the Swiss way", () => {
  for (const [key, text] of leaves(authLabelsFor("de"))) {
    assert.ok(!text.includes("ß"), `de ${key}: ${text}`);
  }
});

test("regions and unknown languages resolve sensibly", () => {
  assert.equal(authLabelsFor("de-CH"), authLabelsFor("de"));
  assert.equal(authLabelsFor("gsw"), authLabelsFor("de"));
  assert.equal(authLabelsFor("fr_CH").signIn, authLabelsFor("fr").signIn);
  assert.equal(authLabelsFor("xx"), DEFAULT_AUTH_LABELS);
  assert.equal(authLabelsFor(undefined), DEFAULT_AUTH_LABELS);
});

test("Spanish locales retain translated recovery and account labels", () => {
  const es = authLabelsFor("es");
  assert.ok(AUTH_LABEL_LOCALES.includes("es"));
  assert.equal(authLabelsFor("es-ES"), es);
  assert.equal(authLabelsFor("es_MX"), es);
  assert.equal(es.signIn, "Iniciar sesión");
  assert.equal(es.recovery.reset, "Restablecer contraseña");
  assert.equal(es.account.signOut, "Cerrar sesión");
});
