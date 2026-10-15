import { betterAuth } from "better-auth";
import type { GenericOAuthConfig } from "better-auth/plugins";
import { type OidcClient } from "./methods.js";
export type AuthMailKind = "verify" | "magicLink" | "reset";
export interface AuthMailer {
    /** Whether mail can be sent at all. Without it the methods that need mail are hidden. */
    configured: boolean;
    /** Send an account mail. Must not throw, and must not log the link. */
    send(kind: AuthMailKind, to: string, url: string): Promise<void>;
}
export interface AuthSite {
    /** The public origin, e.g. https://causius.orangecat.ch. Pinned, never inferred. */
    url: string;
    /** Shown in authenticator apps and passkey prompts. */
    title: string;
    /** Cookie prefix. */
    slug: string;
}
export interface CreateAuthOptions {
    site: AuthSite;
    /** A Drizzle node-postgres or pglite database holding the tables in ./schema. */
    database: unknown;
    /** Defaults to this package's tables; pass your own only if you must. */
    schema?: Record<string, unknown>;
    mail: AuthMailer;
    env?: NodeJS.ProcessEnv;
}
export type AuthStatus = {
    ready: true;
} | {
    ready: false;
    reason: "no_database" | "no_secret";
};
export declare function authStatusFor(databaseConfigured: boolean, env?: NodeJS.ProcessEnv): AuthStatus;
/** An OIDC client as better-auth's generic OAuth provider. */
export declare function oidcProvider(client: OidcClient): GenericOAuthConfig;
export type Auth = ReturnType<typeof betterAuth>;
export declare function createAuthInstance(options: CreateAuthOptions): Auth;
//# sourceMappingURL=server.d.ts.map