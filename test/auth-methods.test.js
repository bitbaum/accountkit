// Which sign-in methods a deployment offers is a pure function of its env, so
// "is this button shown" is a unit test rather than a guess.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ROLE,
  ROLES,
  authBucket,
  isDeliverable,
  isRole,
  isStaff,
  mayGrantRole,
  oidcClients,
  orangecatOidc,
  placeholderEmail,
  signInMethods,
  signinBroker,
  usableIssuer,
} from "../dist/auth/index.js";

const BROKER = {
  SIGNIN_ISSUER: "https://signin.example.ch",
  SIGNIN_CLIENT_ID: "app",
  SIGNIN_CLIENT_SECRET: "s3cret",
};
const ORANGECAT = {
  ORANGECAT_OAUTH_CLIENT_ID: "app",
  ORANGECAT_OAUTH_CLIENT_SECRET: "s3cret",
};

describe("signInMethods", () => {
  test("password, passkeys and 2FA need no setup at all", () => {
    assert.deepEqual(
      (({ password, passkey, twoFactor }) => ({
        password,
        passkey,
        twoFactor,
      }))(signInMethods({ NODE_ENV: "production" }, false)),
      { password: true, passkey: true, twoFactor: true },
    );
  });
  test("an external button is hidden when its env is missing", () => {
    const m = signInMethods({ NODE_ENV: "production" }, false);
    assert.equal(m.signin, false);
    assert.equal(m.orangecat, false);
  });
  test("no mail: no magic link in production, and a sign-up is never stranded", () => {
    const m = signInMethods({ NODE_ENV: "production" }, false);
    assert.equal(m.magicLink, false);
    assert.equal(m.verifyEmail, false);
  });
  test("mail: magic link offered and verification required", () => {
    const m = signInMethods({ NODE_ENV: "production" }, true);
    assert.equal(m.magicLink, true);
    assert.equal(m.verifyEmail, true);
  });
  test("development prints the link locally", () => {
    assert.equal(
      signInMethods({ NODE_ENV: "development" }, false).magicLink,
      true,
    );
  });
  test("each OIDC button shows exactly when its values are set", () => {
    assert.equal(signInMethods({ ...BROKER }, false).signin, true);
    assert.equal(
      signInMethods({ ...BROKER, SIGNIN_CLIENT_SECRET: " " }, false).signin,
      false,
    );
    assert.equal(signInMethods({ ...ORANGECAT }, false).orangecat, true);
    assert.equal(
      signInMethods({ ORANGECAT_OAUTH_CLIENT_ID: "app" }, false).orangecat,
      false,
    );
  });
});

describe("OIDC clients", () => {
  test("discovery URL from the issuer", () => {
    assert.equal(
      signinBroker(BROKER)?.discoveryUrl,
      "https://signin.example.ch/.well-known/openid-configuration",
    );
  });
  test("OrangeCat defaults to its public issuer", () => {
    assert.equal(orangecatOidc(ORANGECAT)?.issuer, "https://orangecat.ch");
    assert.equal(
      orangecatOidc({
        ...ORANGECAT,
        ORANGECAT_OAUTH_ISSUER: "https://oc.test/",
      })?.issuer,
      "https://oc.test/",
    );
  });
  test("an issuer that is not https is refused", () => {
    assert.equal(
      signinBroker({ ...BROKER, SIGNIN_ISSUER: "http://signin.example.ch" }),
      null,
    );
    assert.equal(usableIssuer("https://user:pw@x.ch"), null);
    assert.equal(
      usableIssuer("http://localhost:3001"),
      "http://localhost:3001",
    );
  });
  test("the shared sign-in is listed before OrangeCat", () => {
    assert.deepEqual(
      oidcClients({ ...BROKER, ...ORANGECAT }).map((c) => c.providerId),
      ["bitbaum-signin", "orangecat"],
    );
  });
});

describe("identity rules", () => {
  test("a placeholder address can never receive mail, is stable and hides the subject", () => {
    const a = placeholderEmail("orangecat", "sub-1");
    assert.match(a, /^[0-9a-f]{32}@orangecat\.invalid$/);
    assert.equal(isDeliverable(a), false);
    assert.notEqual(placeholderEmail("bitbaum-signin", "sub-1"), a);
    assert.equal(placeholderEmail("orangecat", "sub-1"), a);
    assert.ok(!placeholderEmail("orangecat", "actor-42").includes("actor-42"));
  });
  test("isDeliverable", () => {
    assert.equal(isDeliverable("person@example.ch"), true);
    for (const bad of ["x@y.INVALID", "", "no-at-sign", null])
      assert.equal(isDeliverable(bad), false);
  });
});

describe("roles", () => {
  test("everyone starts as a customer; only known roles exist", () => {
    assert.equal(DEFAULT_ROLE, "customer");
    assert.ok(ROLES.includes(DEFAULT_ROLE));
    assert.equal(isRole("admin"), true);
    assert.equal(isRole("root"), false);
  });
  test("staff powers go to staff and admins only; only an admin grants, never to themselves", () => {
    assert.deepEqual(ROLES.filter(isStaff), ["staff", "admin"]);
    assert.equal(mayGrantRole({ id: "a", role: "admin" }, "b"), true);
    assert.equal(mayGrantRole({ id: "a", role: "admin" }, "a"), false);
    assert.equal(mayGrantRole({ id: "a", role: "staff" }, "b"), false);
  });
});

describe("rate-limit buckets", () => {
  test("mail, credential and everything else", () => {
    assert.equal(authBucket("/sign-up/email"), "mail");
    assert.equal(authBucket("/sign-in/magic-link"), "mail");
    assert.equal(authBucket("/sign-in/email"), "credential");
    assert.equal(authBucket("/sign-in/oauth2"), "credential");
    assert.equal(authBucket("/two-factor/verify-totp"), "credential");
    assert.equal(authBucket("/get-session"), "auth");
  });
});
