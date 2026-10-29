# AccountKit changelog

This maintained file was started on 2026-10-27. The entries below were
reconstructed from the linked published releases; they are retrospective
records, not claims that this file existed at release time.

## Unreleased

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
