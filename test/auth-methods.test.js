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
  knownSigninProviders,
  loadSigninProviders,
  parseSigninProviders,
  resetSigninProviders,
  signInMethods,
  signinBroker,
  signinButtonLabel,
  DEFAULT_AUTH_LABELS,
  authLabelsFor,
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
  test("mail: magic link offered, and confirming the address is no wall by default", () => {
    const m = signInMethods({ NODE_ENV: "production" }, true);
    assert.equal(m.magicLink, true);
    assert.equal(m.verifyEmail, false);
  });
  test("a product that opts in requires confirmation, but only with mail", () => {
    const strict = { emailConfirmation: "before-sign-in" };
    assert.equal(
      signInMethods({ NODE_ENV: "production" }, true, strict).verifyEmail,
      true,
    );
    assert.equal(
      signInMethods({ NODE_ENV: "production" }, false, strict).verifyEmail,
      false,
    );
  });
  test("development prints the link locally", () => {
    assert.equal(
      signInMethods({ NODE_ENV: "development" }, false).magicLink,
      true,
    );
  });
  test("each OIDC button shows exactly when its values are set", () => {
    const listed = { signinProviders: ["GitHub"] };
    assert.equal(signInMethods({ ...BROKER }, false, listed).signin, true);
    assert.equal(
      signInMethods({ ...BROKER, SIGNIN_CLIENT_SECRET: " " }, false, listed)
        .signin,
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
    assert.equal(authBucket("/two-factor/verify-totp"), "credential");
    assert.equal(authBucket("/get-session"), "auth");
  });
});

import { authStatusFor, secretFrom } from "../dist/auth/server.js";
describe("the session secret", () => {
  test("BETTER_AUTH_SECRET first, the next-auth AUTH_SECRET as a fallback", () => {
    assert.equal(
      secretFrom({ BETTER_AUTH_SECRET: "a", AUTH_SECRET: "b" }),
      "a",
    );
    assert.equal(secretFrom({ AUTH_SECRET: "b" }), "b");
    assert.equal(secretFrom({}), "");
  });
  test("production refuses a short or missing secret, and says why", () => {
    assert.deepEqual(
      authStatusFor(true, { NODE_ENV: "production", AUTH_SECRET: "short" }),
      { ready: false, reason: "no_secret" },
    );
    assert.deepEqual(
      authStatusFor(true, {
        NODE_ENV: "production",
        AUTH_SECRET: "x".repeat(44),
      }),
      { ready: true },
    );
    assert.deepEqual(authStatusFor(false, { NODE_ENV: "production" }), {
      ready: false,
      reason: "no_database",
    });
  });
});

describe("the shared sign-in's button names only what the service publishes", () => {
  const answer =
    (body, status = 200) =>
    async (url) => {
      answer.urls.push(String(url));
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    };
  answer.urls = [];

  test("hidden until the service has said which providers are on", () => {
    resetSigninProviders();
    const m = signInMethods({ ...BROKER, NODE_ENV: "test" }, false);
    assert.equal(m.signin, false);
    assert.deepEqual(m.signinProviders, []);
  });

  test("names the published providers, in the service's order", async () => {
    resetSigninProviders();
    const names = await loadSigninProviders(
      BROKER,
      answer({
        providers: [
          { id: "google", label: "Google" },
          { id: "github", label: "GitHub" },
        ],
      }),
    );
    assert.deepEqual(names, ["Google", "GitHub"]);
    assert.equal(answer.urls.at(-1), "https://signin.example.ch/api/providers");
    assert.deepEqual(knownSigninProviders(BROKER), ["Google", "GitHub"]);
    const m = signInMethods(BROKER, false);
    assert.equal(m.signin, true);
    assert.deepEqual(m.signinProviders, ["Google", "GitHub"]);
  });

  test("an empty list hides the button", async () => {
    resetSigninProviders();
    await loadSigninProviders(BROKER, answer({ providers: [] }));
    assert.equal(signInMethods(BROKER, false).signin, false);
  });

  test("a failed read keeps the last good list; a broken answer is not a list", async () => {
    resetSigninProviders();
    await loadSigninProviders(
      BROKER,
      answer({ providers: [{ label: "GitHub" }] }),
    );
    await loadSigninProviders(BROKER, answer({ error: "down" }, 503));
    await loadSigninProviders(BROKER, async () => {
      throw new Error("offline");
    });
    assert.deepEqual(knownSigninProviders(BROKER), ["GitHub"]);
    assert.equal(parseSigninProviders({ providers: [{ label: 3 }] }), null);
    assert.equal(parseSigninProviders({ providers: "Google" }), null);
    assert.equal(parseSigninProviders(null), null);
  });

  test("nothing is read without SIGNIN_*", async () => {
    resetSigninProviders();
    let called = false;
    const none = await loadSigninProviders({}, async () => {
      called = true;
      return new Response("{}");
    });
    assert.equal(none, null);
    assert.equal(called, false);
    assert.equal(
      signInMethods({}, false, { signinProviders: ["GitHub"] }).signin,
      false,
    );
  });

  test("the label lists exactly the providers, in every language", () => {
    assert.equal(
      signinButtonLabel(DEFAULT_AUTH_LABELS, ["GitHub"]),
      "Continue with GitHub",
    );
    assert.equal(
      signinButtonLabel(DEFAULT_AUTH_LABELS, ["Google", "Microsoft", "GitHub"]),
      "Continue with Google, Microsoft or GitHub",
    );
    assert.equal(
      signinButtonLabel(authLabelsFor("de"), ["Google", "GitHub"]),
      "Weiter mit Google oder GitHub",
    );
    assert.equal(
      signinButtonLabel(authLabelsFor("fr"), ["Google", "Discord"]),
      "Continuer avec Google ou Discord",
    );
    for (const locale of ["de", "fr", "it", "rm", "ru", "es", "en"]) {
      const label = signinButtonLabel(authLabelsFor(locale), ["GitLab"]);
      assert.match(label, /GitLab$/, locale);
      assert.doesNotMatch(label, /Apple|Google/, locale);
    }
  });

  test("a product's own older labels keep their language", () => {
    const old = {
      ...DEFAULT_AUTH_LABELS,
      withSignin: "Weiter mit Google, Apple, GitHub, X oder Facebook",
      withSigninProviders: undefined,
      listOr: undefined,
    };
    assert.equal(
      signinButtonLabel(old, ["Google", "GitHub"]),
      "Weiter mit Google oder GitHub",
    );
    const odd = { ...old, withSignin: "Sign in elsewhere" };
    assert.equal(
      signinButtonLabel(odd, ["Google", "GitHub"]),
      "Continue with Google or GitHub",
    );
  });

  test("no default label names a paid provider", () => {
    for (const locale of ["de", "fr", "it", "rm", "ru", "es", "en"])
      assert.doesNotMatch(
        authLabelsFor(locale).withSignin,
        /Apple|\bX\b/,
        locale,
      );
  });
});
