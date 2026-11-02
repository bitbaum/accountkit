import { passkeyClient } from "@better-auth/passkey/client";
import {
  emailOTPClient,
  magicLinkClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import type { BetterAuthClientPlugin } from "better-auth/client";

type Fetched<T> = Promise<{
  data: T | null;
  error: { code?: string; message?: string; status?: number } | null;
}>;

/** Lightning login's three calls (./lightning), for SignInForm and AccountPanel. */
export function lightningClient() {
  return {
    id: "accountkit-lightning",
    getActions: ($fetch) => ({
      lightning: {
        start: (purpose: "sign-in" | "link" = "sign-in") =>
          $fetch("/lightning/start", {
            method: "POST",
            body: { purpose },
          }) as Fetched<{ k1: string; lnurl: string }>,
        signIn: () =>
          $fetch("/sign-in/lightning", {
            method: "POST",
            body: {},
          }) as Fetched<{
            status: "pending" | "signed-in";
            twoFactorRedirect?: boolean;
          }>,
        link: () =>
          $fetch("/lightning/link", { method: "POST", body: {} }) as Fetched<{
            status: "pending" | "linked";
          }>,
      },
    }),
  } satisfies BetterAuthClientPlugin;
}

/**
 * The plugins the browser client needs, the same in every product:
 *
 *   import { createAuthClient } from "better-auth/react";
 *   import { authClientPlugins } from "@bitbaum/accountkit/auth/client";
 *   export const authClient = createAuthClient({ plugins: authClientPlugins() });
 *
 * The client itself is created by the product, because its fully inferred type
 * cannot be written into a published declaration file. It talks only to this
 * origin (/api/auth), which is all a strict CSP's `connect-src 'self'` allows.
 */
export function authClientPlugins(): [
  ReturnType<typeof twoFactorClient>,
  ReturnType<typeof passkeyClient>,
  ReturnType<typeof magicLinkClient>,
  ReturnType<typeof emailOTPClient>,
  ReturnType<typeof lightningClient>,
] {
  return [
    twoFactorClient(),
    passkeyClient(),
    magicLinkClient(),
    emailOTPClient(),
    lightningClient(),
  ];
}
