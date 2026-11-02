import { passkeyClient } from "@better-auth/passkey/client";
import { emailOTPClient, magicLinkClient, twoFactorClient, } from "better-auth/client/plugins";
/** Lightning login's three calls (./lightning), for SignInForm and AccountPanel. */
export function lightningClient() {
    return {
        id: "accountkit-lightning",
        getActions: ($fetch) => ({
            lightning: {
                start: (purpose = "sign-in") => $fetch("/lightning/start", {
                    method: "POST",
                    body: { purpose },
                }),
                signIn: () => $fetch("/sign-in/lightning", {
                    method: "POST",
                    body: {},
                }),
                link: () => $fetch("/lightning/link", { method: "POST", body: {} }),
            },
        }),
    };
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
export function authClientPlugins() {
    return [
        twoFactorClient(),
        passkeyClient(),
        magicLinkClient(),
        emailOTPClient(),
        lightningClient(),
    ];
}
//# sourceMappingURL=client.js.map