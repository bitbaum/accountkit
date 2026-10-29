import { betterAuth } from "better-auth";
import type { GenericOAuthConfig } from "better-auth/plugins";
import { type OidcClient } from "./methods.js";
import { type BcryptLike } from "./hash.js";
import { type DomainCredentials } from "./domain-credentials.js";
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
    /**
     * Read existing bcrypt and AccountKit $bs1$ credentials during migration.
     * New and reset passwords use the runtime's native scrypt format. Products
     * retain their existing user ids and copy hashes without decrypting them.
     */
    legacyBcrypt?: BcryptLike;
    /** Optional domain proof (for example an existing housing login code). */
    domainCredentials?: DomainCredentials;
    mail: AuthMailer;
    env?: NodeJS.ProcessEnv;
    /**
     * Called as a sign-in method is attached to a person (a first sign-up
     * included), once the person exists. A product that used to identify people by another id — an
     * OrangeCat actor id, say — re-keys its own rows here. Must be idempotent;
     * a throw is logged and never blocks the sign-in.
     */
    onAccountCreated?: (account: {
        userId: string;
        providerId: string;
        accountId: string;
    }) => Promise<void>;
}
export type AuthStatus = {
    ready: true;
} | {
    ready: false;
    reason: "no_database" | "no_secret";
};
/**
 * The session secret: BETTER_AUTH_SECRET, or the AUTH_SECRET a product moving
 * off next-auth already has on its server (better-auth reads the same pair).
 * Either way it must be 32+ characters in production.
 */
export declare function secretFrom(env: NodeJS.ProcessEnv): string;
export declare function authStatusFor(databaseConfigured: boolean, env?: NodeJS.ProcessEnv): AuthStatus;
/** An OIDC client as better-auth's generic OAuth provider. */
export declare function oidcProvider(client: OidcClient): GenericOAuthConfig;
export type Auth = ReturnType<typeof betterAuth>;
export declare function createAuthInstance(options: CreateAuthOptions): Auth;
//# sourceMappingURL=server.d.ts.map