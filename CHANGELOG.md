# AccountKit changelog

This maintained file was started on 2026-10-27. The entries below were
reconstructed from the linked published releases; they are retrospective
records, not claims that this file existed at release time.

## Unreleased

- A product's own GitHub OAuth app (`GITHUB_CLIENT_ID` and
  `GITHUB_CLIENT_SECRET`) signs people in on the shared runtime, at the
  callback such an app already has (`/api/auth/callback/github`), and through
  `nextauth-compat` (`signIn("github")`, or linking for a signed-in person).
  `githubScopes` adds the scopes the product acts with (Loki: `repo` and
  `workflow`). The token reaches `onAccountCreated`, never AccountKit's table.
  A product without its own app still reaches GitHub through the bitbaum
  sign-in.

- `onAccountCreated` now reaches every new person. A first email sign-in link
  creates the person without a sign-in method, so the hook (which ran as a
  method was attached) never ran for them and the product had no row for that
  person. They are now reported once, as soon as they exist, with `providerId:
  NO_SIGN_IN_METHOD` (`"none"`). Password, OIDC and OrangeCat sign-ups are
  still reported once, as their method.
- Add `onAccountDeleted({ userId, email })`, called once a person's account is
  deleted, so a product removes or anonymises its own row. A product's refusal
  before `/delete-user` still stops the deletion before anything is deleted,
  and the hook is not called then.

- `createNextAuthCompat({ screens: "accountkit" })` opens every AccountKit
  endpoint (sign-up, magic link, passkeys, two-factor, recovery, password
  change) beside the `next-auth/react` session protocol. A product moving off
  Auth.js renders AccountKit's screens and keeps `useSession` and `signOut` on
  its own session shape until those pages move too. The default, `"product"`,
  keeps those endpoints closed as before.
- Fix a first OIDC sign-in failing with `unable_to_create_user` in a product
  whose `onAccountCreated` writes its own row while a mirror trigger records
  the same OrangeCat link in AccountKit's table (evig, loki, petvity and
  surf-your-life all do). That record, for the same person, now gives way to
  AccountKit's own. A different person holding the link still fails, as it
  must.
- `onAccountCreated` receives `tokens` (`accessToken`, `refreshToken`,
  `idToken`, `accessTokenExpiresAt`, `scope`). A product that acts at the
  provider on the person's behalf (Loki publishing to OrangeCat) keeps them in
  its own table. AccountKit still stores no provider token.

- Fix `nextauth-compat`'s OIDC sign-in (OrangeCat, the bitbaum sign-in) on
  better-auth 1.7, which serves generic OIDC providers through its core
  `/sign-in/social`, `/link-social` and `/callback/<id>` endpoints. 0.18.0
  still called the removed `/sign-in/oauth2`, so every such sign-in answered
  `unavailable`. The callback opens only for the product's OIDC providers. A
  journey test now runs the whole round-trip against a synthetic issuer
  (`test/oidc-fixture.js`, shared with the second-factor test).

- Add `@bitbaum/accountkit/auth/switch`: `sharedRuntimeEnabled(env)`, the
  one `AUTH_RUNTIME=accountkit` switch a product staging AccountKit beside
  Auth.js reads, free of dependencies so a proxy can ask it cheaply.
- Add `@bitbaum/accountkit/auth/nextauth-compat`: `createNextAuthCompat`
  answers `next-auth/react`'s client protocol from the shared runtime, so a
  product's Auth.js pages run on AccountKit unchanged while it migrates. The
  product supplies its session shape, credentials resolvers, login codes and
  hooks. Five products carried a copy of this each. A resolver that throws answers
  `unavailable` (never a 500), and a hook that throws is logged without
  costing the person their sign-in.
- Add the `accountkit-rehearse-import` command and
  `@bitbaum/accountkit/auth/import-rehearsal`: a product's import SQL in one
  transaction that always rolls back, reported as counts only.
- Add `@bitbaum/accountkit/auth/compat-testing`: a cookie-keeping client for
  journey tests of a product on the compat layer.

- Add `legacyPassword: { matches, verify }` to the server and Next runtime: a
  product's own pre-AccountKit password format (a hand-rolled scrypt
  `hex.salt`, say) signs in as it is, alone or beside `legacyBcrypt`. `matches`
  is asked first and must claim only that format; new and changed passwords
  are native scrypt.

- **Changed default: confirming an address no longer blocks sign-in.** With
  mail configured, a password sign-up is signed in at once and is mailed a
  confirmation link; an unconfirmed account signs in; a first-password claim
  signs the person in and mails the link. Following the link still sets
  `emailVerified`. Products that need the old wall pass
  `emailConfirmation: "before-sign-in"` (server, Next runtime, and the third
  argument of `signInMethods`).

- Add opt-in `ids: "uuid"` to the server and Next runtime: every id the
  runtime mints is a random UUID, so a person AccountKit creates (a first OIDC
  sign-in, its own sign-up) can get a row in a product whose tables reference
  people by a `uuid` column. Stored ids are untouched; the default is unchanged.
- Add `plugins` to the server and Next runtime: a product's own better-auth
  plugins (for example `organization()`), mounted after AccountKit's. Tables
  in `schema` beyond the standard six are handed to the database adapter by
  model name.
- Add `site.trustedOrigins`: further hosts of the same product pass the origin
  check, each with its own host-only cookie. A lookup may stand in for the
  list when the hosts are data.

## 0.13.0 — 2026-10-29

- Add `createAuthTables(prefix)` to `@bitbaum/accountkit/auth/schema`: the
  account tables under a name prefix, for a product whose own tables already
  use the standard names. The default `authSchema` and table exports are
  unchanged; the SQL they generate is identical.

## 0.12.0 — 2026-10-29

- Add opt-in `sessionLifetime(userId)` to the server and Next runtime: a
  product-chosen idle limit for the people it names. Their sessions end after
  that much inactivity and slide at most hourly while active; the shared
  14-day refresh no longer extends them. Everyone else keeps the default.

## 0.11.0 — 2026-10-29

- Add opt-in `provisioning` to the server and Next runtime:
  `POST /api/auth/provision/claim` gives an identity a product created without
  a password (an invitation, a login code) its first password under its
  existing user id. A second identity joins an existing account only on that
  account's own password; an invited account with no password must recover
  through its mailbox first. Verified addresses are never replaced, `.invalid`
  addresses are refused, a single-use proof is given back on failure, and an
  unverified address gets a verification link instead of a session when mail is
  configured. Refusal codes are exported as `CLAIM_ERRORS`.
- A completed password reset verifies the address the link was sent to, when
  that address is unchanged. An imported or invited account with an unverified
  address could previously set a password and still be refused at sign-in.

## 0.10.0 — 2026-10-29

- Add opt-in `domainCredentials` to the server and Next runtime for existing
  product-owned proofs such as a housing login code. The product verifies the
  proof and supplies an existing shared user id; AccountKit owns the session,
  cookies, origin checks and credential rate-limit bucket.
- A `bindSession` callback can persist narrower product identity scope before
  the session is exposed. Failures revoke the new session. Domain sessions
  cannot manage account credentials, enroll a second factor or list other
  sessions; they have a fixed expiry. A password, passkey or configured provider
  is required for account management. Accounts with an enabled second factor
  must use another configured primary method; a domain proof never bypasses it.
- No consumer data is migrated by these options. Products must preserve their
  identity and authorization mappings and exercise their own journeys.

## 0.9.2 — 2026-10-29

- The shared server and Next runtime accept `legacyBcrypt` during credential
  migration. Existing plain bcrypt and AccountKit `$bs1$` passwords remain
  readable under their original user ids. New and reset passwords use native
  scrypt. Products still own identity/role mapping and must verify their data
  migration and browser journeys; this option does not migrate data itself.
- Database regression coverage checks both imported formats, long-password
  suffixes, native registration, recovery token reuse and session revocation.

## 0.9.1 — 2026-10-28

- `@bitbaum/accountkit/auth/password` now also ships a CommonJS build
  (`require` condition, with `.d.cts` types), so a CommonJS backend can use the
  one password rule. The ESM entry is unchanged.
- The reset form asks for the new password once, in the same field with the
  same show/hide control as sign-up (`PasswordField`, shared by both). The
  "repeat new password" field is gone, along with the `recovery.confirmPassword`
  and `recovery.mismatch` labels; products that pass their own recovery labels
  can drop those two keys.
- New entry `@bitbaum/accountkit/auth/password-field` exporting `PasswordField`,
  so a product with its own reset or sign-up page renders the same field
  (pass `classes` to style it with the product's CSS).
- New entry `@bitbaum/accountkit/auth/hash` (ESM and CommonJS):
  `createPasswordHasher(bcrypt)` for products that keep bcrypt/bcryptjs. New
  hashes are bcrypt over the SHA-256 of the password (stored as `$bs1$…`), so
  the whole password counts instead of its first 72 bytes. Old plain bcrypt
  hashes still verify, exactly as before, and `verify` says when to store the
  new form (rehash on sign-in). Nobody has to reset a password.

## 0.9.0 — 2026-10-28

- One password rule everywhere: any non-empty password up to 128 characters
  (`MIN_PASSWORD_LENGTH`, `MAX_PASSWORD_LENGTH`). Sign-up, reset and the server
  agree; the reset form no longer demands 12 characters and sign-up no longer
  demands 8. Existing passwords keep working.
- New browser-safe entry `@bitbaum/accountkit/auth/password` with `passwordProblem()`,
  so products still on their own account code use the same rule.
- Removed the `passwordHint` label (and its text in every language) and the
  hint paragraph under the password fields. Products that pass their own
  labels can drop that key.

## 0.8.1 — 2026-10-28

- `PasswordRecoveryForm` accepts a `PasswordRecoveryClient` (only
  `requestPasswordReset` and `resetPassword`), so products on Auth.js can use
  the shared recovery form through a small adapter. Better Auth clients are
  unchanged. A rejected call (network failure) leaves the form usable.

## 0.8.0 — 2026-10-26

- Registration uses one password field with an integrated visibility control.
- Added the shared release notification workflow.

[Published release and comparison](https://github.com/bitbaum/accountkit/releases/tag/v0.8.0).

## 0.7.2 — 2026-10-26

- Added registration password confirmation. The registration design was
  subsequently replaced by the single-field design in 0.8.0.
- Added the repository's tool-neutral instruction entrypoint.

[Published release and comparison](https://github.com/bitbaum/accountkit/releases/tag/v0.7.2).

## 0.6.3 — 2026-10-25

- Enforced enabled second factors across sign-in methods.
- Added regression coverage for preserving existing accounts when mail is enabled.
- Updated shared package dependency floors.

[Published release and comparison](https://github.com/bitbaum/accountkit/releases/tag/v0.6.3).

Other releases and earlier changes remain available in the
[release archive](https://github.com/bitbaum/accountkit/releases) and
[commit history](https://github.com/bitbaum/accountkit/commits/main).
