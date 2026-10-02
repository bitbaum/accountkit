# @bitbaum/accountkit

One account for every bitbaum product: the account menu (who is signed in, where to go, how to sign out), and **Sign in with OrangeCat** (`@bitbaum/accountkit/orangecat`).

Each product had written its own — Loki's `AccountMenu`, OrangeCat's `UserProfileDropdown` — and each had learned half of what the other had. Loki took initials only from the name; OrangeCat never rebuilt a name from the email address; OrangeCat had arrow keys and a 44px target, Loki had neither; Loki's public pages had no menu at all, so a signed-in person could not find sign-out. This is the one menu, with both halves.

It knows nothing about how you sign in. NextAuth, Supabase, better-auth: you pass the person, the places, and a sign-out function.

## Install

```sh
pnpm add github:bitbaum/accountkit#v0.2.0
```

`dist/` is committed, so the `github:` install needs no build step and no `allowBuilds` entry.

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

**Try again restarts sign-in** (a server action calling `signIn("orangecat", …)`, or a GET route that does). It never goes home, and it never prints the provider's error code. No hooks: renders in a server component.

MIT.
