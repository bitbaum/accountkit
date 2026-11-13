# AccountKit changelog

This maintained file was started on 2026-10-27. The entries below were
reconstructed from the linked published releases; they are retrospective
records, not claims that this file existed at release time.

## Unreleased

### 2026-11-13: GitHub is offered once on a sign-in screen

- `SignInForm` and `SignUpForm` draw a GitHub button when `methods.github` is
  on, and a shared "Continue with …" button that names every provider in
  `methods.signinProviders`. A product whose shared sign-in lists GitHub and
  that also turns `github` on showed "Continue with GitHub" twice, one above
  the other, each going a different way. Seen on Loki's sign-in screen at
  390px on 2026-11-13. `signinProvidersBeside(providers, { github })` now
  leaves GitHub out of the shared button's name when the screen draws
  GitHub's own button; when GitHub is the only provider listed the name is
  kept, so the button never reads as an empty "Continue with". Exported from
  `@bitbaum/accountkit/auth`. Regression test in `test/github-button.test.js`.

### 2026-11-13: rows shown only below 768px (`shown: "narrow"`)

- `AccountMenu`: an item or a group may carry `shown: "always" | "narrow"`
  (default `"always"`, so every product is unchanged), and `extra` has the
  same choice as `extraShown`. A `"narrow"` row is in the menu below 768px
  only. Found in OrangeCat's app-shell audit (2026-11-12): from md up its
  header carries a theme toggle and the menu also showed "Appearance", the
  same control twice at one width; on a phone the header toggle is hidden and
  the menu row is the only one, so it must stay there. OrangeCat hid the row
  with a width read in script, which is wrong on the server render and
  flashes. The package's stylesheet now hides it in a
  `@media (min-width: 768px)` rule; the arrow keys skip a row that is not
  laid out, and a hidden group takes its divider with it (the first group
  still shown after the identity block draws no line of its own).
  `groupShown(group)` and the type `AccountRowShown` are exported. The browser
  check opens a new demo row at 390, 767, 768 and 1280px, light and dark: the
  narrow rows are shown and reached by the arrows below 768px, hidden and
  skipped from 768px, one divider between the groups shown, nothing scrolls
  sideways. Render tests cover `groupShown` and the media query.

### 2026-11-12: OrangeCat first among the "Continue with …" buttons

- Fix: on a product with both OrangeCat and the shared sign-in switched on,
  "Continue with Google or GitHub" stood directly above "Continue with
  OrangeCat", and read as that button's heading (found on BiasLens's sign-in
  at 1920px, 2026-11-12). `OidcButtons` now lists OrangeCat, the fleet's own
  account, first, then the shared sign-in, then a product's own GitHub app.
  The render test fails on the old order. Nothing else about the buttons,
  their words or their classes changes.

### 2026-11-12: AccountControl, fetchAccountSummary, the panel kept on screen

These entries are this change alone; the ones under "Earlier unreleased
entries" below predate it (some of them shipped in 0.29.0).

- Fix: the open `AccountMenu` panel ran off the screen when the trigger was
  not the last control in its row. Found 2026-11-12 in Bitbaum's header,
  where a menu button follows the trigger: at 390px the panel's left edge was
  at -112px and its text was cut off. The panel was pinned to the trigger's
  edge, which fits only when nothing follows it. The menu now measures the
  open panel and, only if it crosses an edge, moves it back inside the screen
  (`--acct-shift`, an offset of the edge the panel is pinned by, so the move
  is made in layout: moved with a transform, the panel sat on screen while the
  page still scrolled sideways on Chromium 156, and it follows the text
  direction); a panel that already fits is not moved, so a trigger that
  is last looks exactly as before. The browser check opens four new demo rows
  (a 44px control before or after the trigger, `align` end and start) at 320
  and 390px, light and dark: the panel's left is at least 0, its right at most
  the viewport, nothing scrolls sideways, and arrows, End and Escape still
  work. It failed on the old stylesheet (left -54px at 320). It also checks
  that a last trigger's panel still ends on the trigger's edge.
- `AccountControl`: one header control for all three states, so a product
  stops writing its own signed-out corner (Loki and Heidi each did).
  `state="loading"` is an empty box the trigger's exact size, hidden from
  assistive technology and not focusable, so nothing moves when the session
  answer arrives; `state={null}` is one "Sign in" link (`.acct-signin`), the
  trigger's height, to `signIn.href`; a person renders `AccountMenu`
  unchanged. The link's text is `signIn.label`, else the new optional label
  `signIn`, else "Sign in". `accountSignInHtml({ href, label })` returns the
  same signed-out markup byte for byte, escaped, for a static page to print
  without React. Render tests compare the two, check the escaping of hostile
  input and that a `javascript:` href becomes `#`; the browser check measures
  the loading box against the signed-in trigger and "Sign in" at 44px.
- `fetchAccountSummary(url, { signal?, fetch? })`: reads a session held on
  another origin. A GET with `credentials: "include"` and `cache: "no-store"`
  that resolves the body when it is 2xx JSON with a boolean `signedIn`, and
  `null` on a network or CORS failure, a non-2xx status, a body that is not
  JSON or one without `signedIn`, or an injected `fetch` that resolves to
  something that is not a response; the promise never rejects. No retries,
  nothing stored. `timeoutMs` (default 8000; 0, less or `Infinity` turns it off) bounds
  the whole read, body included, and is combined with the caller's `signal`
  (`AbortSignal.any` where the runtime has it, by hand otherwise): whichever
  fires first aborts the request and the promise resolves `null`, so a server
  that stalls cannot leave a header loading for ever. Unit tests with an
  injected fetch cover each case, the request's method, credentials and
  cache, a fetch and a body that never settle, the default of 8000ms, the
  caller's abort with a timeout armed, and the hand-made combination.
- The open panel is placed again while it stays open when the header row
  changes without a window resize: a `ResizeObserver` (where the runtime has
  one) on the panel, the row the menu sits in (the nearest flex or grid
  ancestor) and that row's controls, and a `MutationObserver` for controls
  added to or removed from the row; both are disconnected when the menu
  closes or unmounts. The browser check opens the menu in the "followed"
  rows, then adds another 44px control after the trigger, and separately
  widens the one already there, without resizing the window: the panel stays
  inside 320 and 390px. Before, its left edge was at -47px at 320.
- `returnPath` is exported from the browser-safe `.` entry too. It was only
  reachable through `./orangecat`, which imports `node:crypto`, so a static
  page could not use it. It is the same function; new tests check that
  protocol-relative paths, backslashes, control characters and absolute URLs
  fall back, and that no `node:` import reaches the `.` entry.
- The browser check honours `CHROMIUM_PATH`, for a machine whose Chromium is
  not the one this Playwright version downloads.

### Earlier unreleased entries

- `AccountMenu` shows what waits in another account. An account in
  `accounts` may carry `waiting`, a count (unread messages, notifications).
  It is shown at the end of that account's row, capped at 99+, and as a dot
  beside the trigger, so a person knows before opening the menu. The trigger's
  accessible name says so too. Zero, absent or not a positive number shows
  nothing, and so does a count with no `onSwitchAccount`. Two new labels
  (`waiting`, `waitingElsewhere`).
- The shared sign-in (Morulia) and OrangeCat are told the page's language.
  `OidcButtons`, `SignInForm` and `SignUpForm` send OIDC `ui_locales` on
  their authorize request: the new optional `locale` prop, or else the
  page's `<html lang>`, so an app that passes nothing still sends the right
  language. A sign-in started on Heidi's German pages from an English
  browser used to land on an English provider page. GitHub is not sent it.
  `uiLocalesFor` is exported.
- `AccountMenu` switches accounts. New optional `accounts` (each
  `{ id, user, note? }`) and `onSwitchAccount(id)`: the other accounts a
  person can become are listed under who is signed in, each a face (photo,
  initials from the name, or a glyph), a name and one line with the note and
  the handle, never the email. A tap switches; while the promise is pending
  the row says so, and a switch that rejects keeps the menu open and says it
  did not complete. Arrow keys reach the rows. Three new labels
  (`switchAccount`, `switching`, `switchFailed`). Without the new props the
  menu renders exactly as before. Built for OrangeCat's identities, where one
  person holds several accounts.
- The optional `@bitbaum/mail-kit` peer accepts 0.3 and 0.4 as well as 0.2.
  Both added only new exports (`renderMail`, unsubscribe signing, the SMTP
  transport); the three AccountKit calls (`conventionalFrom`,
  `isMailConfigured`, `sendMail`) are unchanged, and AccountKit's own tests
  already run against 0.3.0. Apps on mail-kit 0.3 or 0.4 no longer get a
  peer conflict.
- Screens for a product's own codes (#67). `SignInForm` takes `codeDoor`: a
  quiet button opens one field in the product's words (AOZ: "Zugangscode"),
  sent to the server's `/sign-in/domain` (`domainCredentials`). A personal
  link's `?<param>=` opens it and signs in once, then leaves the address bar.
  An account with a second factor is refused in AccountKit's words with the
  way back to email on the same screen. `ClaimForm` is new: a code (or a claim
  link's credential the page holds), an email and a first password, sent to
  `/provision/claim` (`provisioning`), saying what happened: signed in, asked
  to confirm the address, or asked to sign in for a second factor; every
  `CLAIM_*` refusal is a sentence. New optional labels `code` and `claim` in
  all seven languages; the client's `$fetch` carries both calls.

- Fix: 0.26.0's `lightningClient()` wrote better-auth's `BetterFetch` type
  into the published declaration, so a product whose better-auth resolved
  another `@better-fetch/fetch` could not pass `authClientPlugins()` to
  `createAuthClient` (BiasLens's typecheck failed). The plugin now types its
  one call by shape; a test keeps better-fetch names out of the declaration,
  and `test/types/client.ts` compiles the product's own wiring.

- A product's own GitHub app (`githubSignIn: true`) now shows on the shared
  screens: `signInMethods(env, mail, { githubSignIn: true }).github`, a
  "Continue with GitHub" button beside OrangeCat on sign-in and sign-up, and
  the same link button as OrangeCat's in the account panel. The two variables alone
  still offer nothing. This lets Loki, which keeps its GitHub sign-in (the
  owner, 2026-11-02), move onto `SignInForm`.

- Lightning login (LNURL-auth, LUD-04): the person's own Lightning wallet
  signs a one-time challenge shown as a QR code (or opened by a `lightning:`
  link on the same device). Free, no key, no third party, nothing paid; the
  signed key is a sign-in method (`providerId: "lightning"`), never an email.
  Opt-in per deployment with `ACCOUNTKIT_LIGHTNING=1` (`signInMethods(...)
  .lightning`); `SignInForm` and `SignUpForm` offer "Sign in with a Lightning
  wallet", `AccountPanel` adds one to an account. Only the browser that showed
  the code can finish the sign-in; a challenge lives five minutes and is used
  once; a second factor applies. Verified against LUD-01's example and a
  signature made by OpenSSL. New dependencies: `@noble/curves`, `@scure/base`
  (audited, by the same author), `uqr` (the QR code, drawn as one SVG path).

- `createAuthMailer` takes a product's own words and look: `render(kind,
  url, extra)` returns the subject, text and HTML (with `extra.code` for a
  sign-in link; `codes: true` says the template prints it), and `own` lets a
  product send its own mail for one kind (evig's 6-digit confirmation),
  falling back to the shared mail when it cannot. The origin check, the
  transport and the code stay the package's. It no longer sends to an address
  that cannot receive mail (`*.invalid` placeholders). Products that kept their
  own mailer for their languages (causius, diplodoctor, keller) can now use
  the shared one.

- The sign-in link's email also carries a six-digit code, typed on the page
  that asked for the link. A link opens wherever the mail app opens it, often
  another browser or another device; the code finishes the sign-in where the
  person is. It needs nothing beyond the mail a product already sends and no
  third party. Ten minutes, three tries, stored hashed; a second factor
  applies as to every other way in. Only a mailer with `codes: true`
  (`createAuthMailer` has it) gets one, and the link request then answers
  `{ code: true }`, so `SignInForm` shows the field only when the email has the
  code. better-auth's own code endpoints for sending, reset, verification and
  email change stay closed (404): recovery keeps its one path. New labels
  `codePrompt` and `signInWithCode` in all six languages;
  `authClientPlugins()` adds `emailOTPClient()`.

- `accountDeletion: false` (`createAuthRuntime` or `createAuthInstance`)
  turns off self-service deletion: `/delete-user` answers 404 and nothing is
  deleted. `AccountPanel` takes `deletion`, the product's own way out (such as
  a link to an erasure request), shown in place of the delete control. Vita
  keeps medical records for ten years under Swiss law, so its patients ask for
  erasure instead of pressing a button; before this, adopting AccountKit's
  panel would have given them one.

- `AccountPanel` takes `ownProfile`: a product whose own row holds the
  person's name (and shows it on its own profile page) leaves the panel's
  Profile section out, so one person never has two names that drift apart.

- The shared sign-in's button names only the providers Morulia has switched
  on. `signInMethods` reads them from `<SIGNIN_ISSUER>/api/providers` (cached
  per issuer, refreshed at most once a minute in the background, the last good
  list kept on a failed read) and returns them as `signinProviders`; `signin`
  is true only when that list has at least one name. Until 0.24 the button
  read "Continue with Google, Apple, GitHub, X or Facebook" whatever was
  configured, so an app could name a provider that led nowhere. The label is
  `withSigninProviders` ("Continue with {providers}") joined with `listOr`, in
  all six languages; a product's own older `withSignin` keeps its words. The
  fallback `withSignin` no longer names Apple or X, which are paid.

- A button label that keeps a hyphenated word whole now reads as one sentence
  again. 0.22.1 put the parts beside each other, and a flex button (AccountKit's
  own stylesheet, and evig's) laid each one out as its own item: evig's sign-in
  card read "Stattdessen einen / Anmeldelink per | E-Mail | schicken" in three
  columns. The parts now sit in one span. The browser check also lays out every
  word of every button label in every language at 320 and 390px and fails when
  a word starts above or left of the word before it.

- A product's own GitHub sign-in is opt-in: `createAuthRuntime({ githubSignIn:
  true })` (or `createAuthInstance`). Without it, `GITHUB_CLIENT_ID` and
  `GITHUB_CLIENT_SECRET` offer no GitHub sign-in, neither on AccountKit's
  endpoints nor in `nextauth-compat`'s provider list, which reads the choice
  from the runtime. In 0.22 their presence alone switched GitHub on, so Loki,
  whose GitHub app is for repository access, offered a sign-in it never chose.
  `productGithubApp(env, signIn)` takes the choice as its second argument.

- Button labels never cut a hyphenated word across two lines. At 390px evig's
  sign-in card read "per E- / Mail schicken": a browser may break after any
  hyphen. Each hyphenated word in a button label ("E-Mail", "e-mail",
  "pled-clav") is now kept whole, in every language and in a product's own
  labels; spaces still wrap. The browser check lays out every button of the
  sign-in card in every shipped language at 320 and 390px and fails on such a
  cut.

- A product's own GitHub OAuth app (`GITHUB_CLIENT_ID` and
  `GITHUB_CLIENT_SECRET`) signs people in on the shared runtime (opt-in since
  the entry above), at the
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
