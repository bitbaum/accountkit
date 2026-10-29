# @bitbaum/accountkit

One account for every bitbaum product: the account menu (who is signed in, where to go, how to sign out), and **Sign in with OrangeCat** (`@bitbaum/accountkit/orangecat`).

Each product had written its own — Loki's `AccountMenu`, OrangeCat's `UserProfileDropdown` — and each had learned half of what the other had. Loki took initials only from the name; OrangeCat never rebuilt a name from the email address; OrangeCat had arrow keys and a 44px target, Loki had neither; Loki's public pages had no menu at all, so a signed-in person could not find sign-out. This is the one menu, with both halves.

It knows nothing about how you sign in. NextAuth, Supabase, better-auth: you pass the person, the places, and a sign-out function.

## Install

Use the current verified installation command on the
[AccountKit package page](https://bitbaum.orangecat.ch/packages/accountkit/).
Fleet's [package registry](https://github.com/bitbaum/fleet/blob/main/registers/packages.json)
is the source for the verified artifact and install transport; npm may lag a
verified Git release. [Release history](CHANGELOG.md) distinguishes the
registration designs shipped in different versions.

`dist/` is committed, so the `github:` install needs no build step and no `allowBuilds` entry.

## Password recovery

`SignInForm` includes password recovery when `signInMethods(env, mail.configured)`
reports `passwordReset`. It uses the product's Better Auth client and sends the
reset link back to its existing `signInPath`, preserving the local `next` path.
That page must remain reachable when signed out and must render `SignInForm`
when the reset callback carries `token` or `error=INVALID_TOKEN`. The form removes
the token from browser history after reading it. Products with a separate reset
route can render `PasswordRecoveryForm` from `@bitbaum/accountkit/auth/react`.

`PasswordRecoveryForm` takes a `PasswordRecoveryClient`: only `requestPasswordReset`
and `resetPassword`. A Better Auth client satisfies it as is. A product on
Auth.js (or any other session system) passes a small adapter object with those
two functions, each resolving `{ error }` on failure, and keeps its own users,
passwords, roles and sessions. A call that rejects, such as a dropped
connection, leaves the form usable with the unavailable message and the typed
address kept, so the person can retry.

```ts
import type { PasswordRecoveryClient } from "@bitbaum/accountkit/auth/react";
const client: PasswordRecoveryClient = {
  requestPasswordReset: ({ email }) => post("/api/auth/forgot-password", { email }),
  resetPassword: ({ token, newPassword }) =>
    post("/api/auth/reset-password", { token, password: newPassword }),
};
```

The standard mail adapter is `createAuthMailer` from `@bitbaum/accountkit/auth/mail`:

```ts
import { createAuthMailer } from "@bitbaum/accountkit/auth/mail";
const mail = createAuthMailer({ site: { title: "Example", url: "https://example.ch" } });
```

Install its optional peer `@bitbaum/mail-kit`. The adapter reads deployment
configuration lazily, uses the fleet sender and the product's reply address,
and supports subject overrides. It rejects malformed or foreign-origin links
and never logs a token, address or credential. Configuration still needs a real
Resend key and working sender; this adapter does not claim delivery readiness.

The sender must actually deliver account mail: `createAuthRuntime({ mail })`
calls `mail.send("reset", to, url)`. A deployment with `mail.configured=false`
does not offer recovery and disables its server request handler. A no-op sender
does not implement recovery. `authLabelsFor(locale)` includes recovery words;
older product label overrides remain compatible through the English fallback.

The package checks the complete token/callback/reset journey against Postgres,
including account-existence parity, expiry, one-time use, session revocation and
external-redirect rejection. Its browser suite checks the forms at 320px, 390px
and desktop width. Consumers must also verify their own page wiring and delivery.

```ts
import "@bitbaum/accountkit/styles.css";
import { AccountMenu } from "@bitbaum/accountkit";
```

## Use

```tsx
<AccountMenu
  user={{ name: session.user.name, email: session.user.email, image: session.user.image }}
  groups={[{ id: "nav", items: [{ id: "settings", label: "Settings", href: "/settings" }] }]}
  extra={<ThemeToggle />}
  onSignOut={() => signOut({ callbackUrl: "/sign-in" })}
  renderLink={(props) => <Link {...props} />}
/>
```

- **`onSignOut`** may return a promise. While it runs the row says so; if it rejects, the menu stays open and says sign-out did not complete. A sign-out that fails silently is the one thing this menu must never do.
- **`renderLink`** keeps your router (Next `<Link>`); the default is a plain `<a>`.
- **`extra`** is for rows that are not places, such as a theme switch.
- **`labels`** translates every string: `labels={{ trigger: "Konto: {name}", signOut: "Abmelden" }}`.

## What is shared, and not configurable

- **The name is never built from the email.** No name: `@handle`. No handle: "Account".
- **Initials come from the name only.** No name and no photo: a person glyph.
- **A photo that fails to load** falls back to initials, then the glyph.
- **44px** trigger and rows. The panel never runs off a 320–390px screen.
- **Escape** closes and returns focus to the trigger, wherever focus was. **Arrows**, **Home** and **End** move between items. A click outside closes.

## Theming

Every colour, radius and font is an `--acct-*` variable. The defaults read `@bitbaum/design-tokens` at zero specificity, so apps on those tokens match with no work and an app's own `:root` always wins. An app whose tokens are full colours rather than HSL triplets (Loki's are OKLCH) maps them once:

```css
:root {
  --acct-panel: var(--surface-overlay);
  --acct-fg: var(--text-primary);
  /* … */
}
```

## Accounts (`@bitbaum/accountkit/auth`)

Every product owns its accounts, and they are the same account system everywhere: email and password, a magic link, passkeys, two-factor codes, the shared bitbaum sign-in and Sign in with OrangeCat (each shown only when configured). Built on [better-auth](https://www.better-auth.com) 1.x, so a product writes none of it.

```ts
// lib/db/schema.ts — one identical migration in every product
export * from "@bitbaum/accountkit/auth/schema";

// lib/auth.ts
import { createAuthRuntime } from "@bitbaum/accountkit/auth/next";
export const { GET, POST, getSession, requireUser, authStatus, getAuth } = createAuthRuntime({
  site: { url: "https://app.example.ch", title: "Example", slug: "example" },
  mail: { configured, send },            // your mail-kit sender; never log the link
  isDatabaseConfigured: (env) => Boolean(env.DATABASE_URL),
  getDatabase: () => db,                 // Drizzle, built on first use
});

// app/api/auth/[...all]/route.ts
export { GET, POST } from "@/lib/auth";

// lib/auth-client.ts
import { createAuthClient } from "better-auth/react";
import { authClientPlugins } from "@bitbaum/accountkit/auth/client";
export const authClient = createAuthClient({ plugins: authClientPlugins() });
```

The screens are shared too (`@bitbaum/accountkit/auth/react`): `SignInForm`, `SignUpForm` and `AccountPanel`. They hold the logic and take the product's words (`labels`: `authLabelsFor(locale)` from `@bitbaum/accountkit/auth` has English, German, French, Italian, Romansh and Russian, so a product keeps no copy of its own; override `account.roles` if its roles have other names) and look (`classes`; without them the `acct-auth-*` classes in `styles.css` apply, on `--acct-*` variables):

```tsx
<SignInForm client={authClient} methods={signInMethods(process.env, mailConfigured)}
  labels={myLabels} classes={{ button: "btn-primary", input: "field" }}
  next="/de/matters" signInPath="/de/sign-in" signUpLink={<Link href="/sign-up">…</Link>} />
```

A product whose rows were keyed on an OrangeCat actor id before it had accounts passes `legacyIdentityProvider: "orangecat"`: a person whose first way in was OrangeCat keeps that id as `user.actorId`, so nothing has to be migrated; everyone else's `actorId` is their user id.

What is the same everywhere, and not configurable per product: one password rule, `MIN_PASSWORD_LENGTH` = 1 and `MAX_PASSWORD_LENGTH` = 128 (exported from `@bitbaum/accountkit/auth/password`, browser-safe, together with `passwordProblem(password)`; products that keep their own account code import the rule from there), the same in sign-up, reset and the server, with no strength meter, no hint text and no other requirement; a sign-up asks for an email and a password, nothing else; sessions of 14 days; no IP addresses stored; an address is never an identity (a new method joins an account only when the signed-in person links it); provider tokens are never kept; a sign-up cannot choose its role; one rate limiter keyed on the proxy's hop (limitkit), with a stricter bucket for anything that sends mail. `signInMethods(env, mailConfigured)` says which buttons to show, as booleans.

Needs `BETTER_AUTH_SECRET` (32+ characters; a product moving off next-auth may keep its `AUTH_SECRET`) and a database; without them every auth route answers 503 `accounts_unavailable` instead of crashing. Peer dependencies: `better-auth`, `@better-auth/passkey`, `drizzle-orm`, and `next` for `/auth/next`.

## Verify

```sh
pnpm run verify   # format, lint, types, build, unit + render tests, real-browser checks
```

The browser checks run the demo at 390px in light and dark: 44px targets, no sideways scroll with the menu open, Escape after a mouse open, arrow keys, outside click, a broken photo, an anonymous account, and a failing sign-out.

## Sign in with OrangeCat — `@bitbaum/accountkit/orangecat`

Nine apps wrote this themselves and each learned something the others had not. This is all of it, once. Server-only, no next-auth import (the types are structural), so it serves Auth.js v5 and next-auth v4.

```ts
import { orangecatClient, orangecatProvider, syncOcSession } from "@bitbaum/accountkit/orangecat";

const orangecat = orangecatClient(); // ORANGECAT_OAUTH_CLIENT_ID / _SECRET / _ISSUER, or null

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { error: "/auth/error" },
  providers: orangecat ? [orangecatProvider(orangecat)] : [],
  callbacks: {
    jwt: ({ token, account, profile }) => syncOcSession({ token, account, profile }, orangecat),
    session: ({ session, token }) => ({ ...session, actorId: token.actorId }),
  },
});
```

What is not configurable, and why:

- **`client_secret_post` and PKCE.** OrangeCat's token endpoint accepts only `client_secret_post`; the Auth.js default is answered with a 400 that reads "client_id is required". PKCE is required even with a secret.
- **`profile()` has no `email`.** OrangeCat auto-confirms addresses, so `email_verified` proves nothing. With an `email`, Auth.js looks a new account up by it and either links (takeover) or refuses. The address rides along as `contactEmail`, contact data only. The identity is `sub` (`token.actorId`), never the email.
- **A revoked grant ends the session.** `syncOcSession` refreshes once the access token expires; `invalid_grant` drops `actorId` (read that, never `token.sub`, as "signed in"); any other failure keeps the session and retries in 60 s. Safe inside `jwt()` since orangecat#1212 (confidential clients keep their refresh token).

Entry: `signIn("orangecat", { redirectTo: returnPath(from) }, authorizationParams({ mode, email, provider }))` → `prompt=create`, `login_hint`, `idp_hint` (google, github — the providers OrangeCat has switched on). `returnPath` accepts only same-origin paths.

Apps with their own user table:

- `withOrangecatIdentity(adapter, store, { keepTokens })` — an OrangeCat sign-in resolves by `sub` alone; a new sub always creates a new user, stored with its OrangeCat address when free and `orangecat-<sub>@users.invalid` when taken. Linking an existing account is Auth.js's own path (sign in, then sign in with OrangeCat). `keepTokens: true` also writes the accounts row (for an app that calls OrangeCat on the person's behalf).
- `resolveOrangecatUser(store, identity)` — the same, for a callback (next-auth v4, no adapter). Survives the insert race.
- `decideOrangecatSignIn(input, policy)` — the pure rule, with `whenEmailTaken` / `whenNoEmail: "refuse"` for an app that prefers to send the person to connect from their profile.
- `mintLinkToken` / `readLinkToken` — evig's "Connect OrangeCat": a 10-minute signed cookie set from inside the session, so the identity that comes back attaches to that account and no other.
- `emailEarnsPromotion(provider)` — never ADMIN_EMAILS promotion for an OrangeCat login.
- `mayReceivePasswordReset({ email, hasPassword, orangecatLinked })` — no reset link for an account OrangeCat created, or for a placeholder.

### The error screen

```tsx
import { SignInError } from "@bitbaum/accountkit";

// app/auth/error/page.tsx — Auth.js `pages.error`
<SignInError error={searchParams.error} retry={restartSignIn} retryFields={{ from }} home="/" />
```

**Import `@bitbaum/accountkit/styles.css`** (once, in the root layout or globals) and map the `--acct-*` variables onto the app's tokens, or the screen renders as bare text — solon shipped exactly that once, and no lint or typecheck can see it. Look at it at 390px before merging.

**Try again restarts sign-in** (a server action calling `signIn("orangecat", …)`, or a GET route that does). It never goes home, and it never prints the provider's error code. No hooks: renders in a server component.

MIT.

### Request-dependent sessions

`getSession()` is a server-component request API. It reads Next headers before
checking deployment readiness and lets framework rendering signals propagate.
A build without account secrets must not cache a signed-out page or redirect for
all future sessions. Calls outside a request are errors, not signed-out users.

### Second-factor policy

An enabled second factor applies to password, email-link, passkey and OIDC sign-in. The server reuses BetterAuth's native signed challenge, trusted-device validation, attempt limits and expiry. A primary credential alone does not leave an authenticated session while the challenge is pending.

Shared forms complete both JSON `twoFactorRedirect` responses and app-local `?twoFactor=1` redirects. Custom clients must handle those states and supply their local sign-in screen as `errorCallbackURL` for email/OIDC callbacks. `SignUpForm` accepts an optional `signInPath` for nonstandard route names; standard `/sign-up` routes infer the sibling `/sign-in`. Challenge URLs contain no bearer credential.

## Password entry

The shared registration form has one password field with a localized show/hide
control, preserves paste and password-manager autofill, and asks for no real
name. The password reset form uses the same field (one input, the same show/hide
control), so sign-up and reset cannot drift. Both forms and the server read
the one rule from `src/auth/password.ts`; there is no other password
requirement and no hint text. Passwordless methods keep their existing flow.
Products consume this behavior through the package rather than duplicating it.

A product that keeps its own sign-in and its own bcrypt/bcryptjs uses
`@bitbaum/accountkit/auth/password` for the rule (a `require` build exists for
CommonJS backends), `@bitbaum/accountkit/auth/password-field` for the field and
`@bitbaum/accountkit/auth/hash` for hashing. `createPasswordHasher(bcrypt)`
hashes the SHA-256 of the password, so a long password is not cut at bcrypt's
72 bytes, and still verifies old plain bcrypt hashes; its `verify` returns
`rehash: true` when a sign-in matched an old hash, and the product then stores
`hash(password)`. No one has to reset a password.

When moving those accounts into the shared runtime, pass `legacyBcrypt: bcrypt`
to `createAuthRuntime` or `createAuthInstance` and import the existing hashes
under the same stable user ids. The runtime then verifies plain bcrypt and
`$bs1$` hashes as well as native scrypt hashes. New registrations and password
resets write native scrypt; reset still revokes existing sessions. Identity and
role mapping, migration verification and product journeys remain the consumer's
responsibility. This option alone does not migrate any data.


### A product's own plugins

`plugins` (both `createAuthRuntime` and `createAuthInstance`) mounts a
product's own better-auth plugins for its domain, such as `organization()`
for workspaces, after AccountKit's own. They add endpoints and tables; the
shared sign-in methods, limits and cookie rules stay AccountKit's. Pass their
tables in `schema` under the plugin's model names (`organization`, `member`,
`invitation`), and a `session` table with any column the plugin adds.

A product served on more than one host (a tenant host beside its platform
host) lists the others in `site.trustedOrigins`. Their requests pass the
origin check and keep their own host-only cookies; mail links and passkeys
use `site.url`.

### Account tables beside a product's own

A product whose tables already use the standard names (a NextAuth `users`,
`accounts`, `sessions`) creates the account tables under a prefix and passes
them to the runtime: `const tables = createAuthTables("auth_")`, then
`schema: tables` (both `createAuthRuntime` and `createAuthInstance`). The
columns are identical to the standard set; only table and index names change.

### Domain credentials during migration

`createAuthRuntime` and `createAuthInstance` accept an optional
`domainCredentials.verify(credential)` callback. It returns `null` for an invalid
proof, or `{ userId, bindSession? }` for an existing shared user. This enables
`POST /api/auth/sign-in/domain` with `{ credential }`; use the runtime's `POST`
handler so the shared credential limiter applies. Never accept a user id from
the request as the verification result.

`bindSession(sessionId)` persists product-owned restrictions before the session
cookie is set. For example, a staff code of a dual-identity account grants only
the staff surface. Store that scope against the shared session id with cascade
deletion and read it on every product request. A failed binding revokes the new
session. Domain sessions have fixed expiry and cannot enroll credentials,
change account security or list other sessions. Show a password/passkey/provider
sign-in action before offering account management. An account with an enabled
second factor must use another configured primary method; domain proof alone
never bypasses MFA. The shared tables require no change for this option.

### First passwords and linking a second identity

A product that created people before they had a password (an invitation, a
login code) passes `provisioning.resolve(credential)`. It returns `null`, or
`{ userId, link?, complete?, release? }` for the shared user that holds the
identity the proof names. This enables `POST /api/auth/provision/claim` with
`{ credential, email, password, name?, callbackURL? }`, rate limited as a
credential. Take a single-use proof inside `resolve` and give it back in
`release`, which runs on every failure after it.

- A user with no password gets one, under its existing id, at the address typed.
  An address that cannot receive mail (`.invalid`) is refused. A verified
  address is never replaced; the same address keeps its verification, a new
  one starts unverified.
- An address that belongs to another account joins this identity to it only on
  that account's own password, then calls `link(targetUserId)`. Without `link`
  the claim is refused. If that account has no password yet (invited, never
  claimed), the claim is refused with `CLAIM_EMAIL_NEEDS_RECOVERY`: recovery
  through its mailbox comes first.
- An identity that already has a password is refused; sign in or recover.
- With mail configured an unverified address gets a verification link and no
  session (`status: "verify_email"`); the link signs them in. An account with a
  second factor is linked but must still sign in (`status: "sign_in"`).

Refusals carry the codes in `CLAIM_ERRORS` (`@bitbaum/accountkit/auth`).

### A shorter idle limit for some people

`sessionLifetime(userId)` returns seconds, or nothing for the shared default
(14 days). For a person it names, a session idle longer than that is deleted on
its next request, an active one slides to now + limit at most once an hour,
and the shared 14-day refresh never applies. Products use it where their own
rule is stricter, for example staff on 8 hours.

A used password-reset link verifies the address it was sent to, unless the
account's address changed after it was sent. Recovery therefore leaves an
imported or invited account with a usable sign-in when mail is configured.
