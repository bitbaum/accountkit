# AccountKit changelog

This maintained file was started on 2026-10-27. The entries below were
reconstructed from the linked published releases; they are retrospective
records, not claims that this file existed at release time.

## 0.9.1 — 2026-10-28

- `@bitbaum/accountkit/auth/password` now also ships a CommonJS build
  (`require` condition, with `.d.cts` types), so a CommonJS backend can use the
  one password rule. The ESM entry is unchanged.
- The reset form asks for the new password once, in the same field with the
  same show/hide control as sign-up (`PasswordField`, shared by both). The
  "repeat new password" field is gone, along with the `recovery.confirmPassword`
  and `recovery.mismatch` labels; products that pass their own recovery labels
  can drop those two keys.

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
