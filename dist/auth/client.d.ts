import { passkeyClient } from "@better-auth/passkey/client";
import { emailOTPClient, magicLinkClient, twoFactorClient } from "better-auth/client/plugins";
/**
 * The one call the plugin makes, typed by shape. Naming better-auth's own
 * fetch type here wrote it into the published declaration, and a
 * product whose better-auth resolved another copy of better-auth's fetch could no
 * longer pass authClientPlugins() to createAuthClient (0.26.0).
 */
type PluginFetch = (path: string, options: {
    method: "POST";
    body: object;
}) => Promise<unknown>;
type Fetched<T> = Promise<{
    data: T | null;
    error: {
        code?: string;
        message?: string;
        status?: number;
    } | null;
}>;
/** Lightning login's three calls (./lightning), for SignInForm and AccountPanel. */
export declare function lightningClient(): {
    id: string;
    getActions: ($fetch: PluginFetch) => {
        lightning: {
            start: (purpose?: "sign-in" | "link") => Fetched<{
                k1: string;
                lnurl: string;
            }>;
            signIn: () => Fetched<{
                status: "pending" | "signed-in";
                twoFactorRedirect?: boolean;
            }>;
            link: () => Fetched<{
                status: "pending" | "linked";
            }>;
        };
    };
};
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
export declare function authClientPlugins(): [
    ReturnType<typeof twoFactorClient>,
    ReturnType<typeof passkeyClient>,
    ReturnType<typeof magicLinkClient>,
    ReturnType<typeof emailOTPClient>,
    ReturnType<typeof lightningClient>
];
export {};
//# sourceMappingURL=client.d.ts.map