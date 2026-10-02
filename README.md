# @bitbaum/accountkit

One account menu for every bitbaum product: who is signed in, where to go, how to sign out.

Each product had written its own — Loki's `AccountMenu`, OrangeCat's `UserProfileDropdown` — and each had learned half of what the other had. Loki took initials only from the name; OrangeCat never rebuilt a name from the email address; OrangeCat had arrow keys and a 44px target, Loki had neither; Loki's public pages had no menu at all, so a signed-in person could not find sign-out. This is the one menu, with both halves.

It knows nothing about how you sign in. NextAuth, Supabase, better-auth: you pass the person, the places, and a sign-out function.

## Install

```sh
pnpm add github:bitbaum/accountkit#v0.1.0
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

MIT.
