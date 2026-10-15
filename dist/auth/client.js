import { passkeyClient } from "@better-auth/passkey/client";
import { magicLinkClient, twoFactorClient } from "better-auth/client/plugins";
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
    return [twoFactorClient(), passkeyClient(), magicLinkClient()];
}
//# sourceMappingURL=client.js.map