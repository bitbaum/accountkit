import { betterAuth, type BetterAuthPlugin } from "better-auth";
import type { GenericOAuthConfig } from "better-auth/plugins";
import { type EmailConfirmation, type OidcClient } from "./methods.js";
import { type BcryptLike } from "./hash.js";
import { type DomainCredentials } from "./domain-credentials.js";
import { type AccountProvisioning } from "./provisioning.js";
import { type SessionLifetime } from "./session-lifetime.js";
export type { DomainCredentials } from "./domain-credentials.js";
export type { SessionLifetime } from "./session-lifetime.js";
export type { AccountProvisioning, ProvisionedIdentity, } from "./provisioning.js";
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
    /**
     * Further public origins that serve the same product (a tenant host beside
     * the platform host). Requests from them pass the origin check; each host
     * keeps its own host-only cookie. Links in mail and passkeys use `url`.
     * A lookup (for hosts kept as data) is asked on each checked request.
     */
    trustedOrigins?: string[] | (() => Promise<string[]>);
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
    /**
     * Read a product's own pre-AccountKit password format during migration (for
     * example a hand-rolled scrypt `hex.salt`). `matches` claims a stored hash
     * by its shape; `verify` checks a password against it. Checked before
     * bcrypt and the native format, so it must claim only its own hashes. New
     * and reset passwords use the runtime's native scrypt format.
     */
    legacyPassword?: LegacyPasswordFormat;
    /** Optional domain proof (for example an existing housing login code). */
    domainCredentials?: DomainCredentials;
    /**
     * First password for an identity the product created without one (an
     * invitation, a login code), and linking a second identity to an existing
     * account on that account's own password. See ./provisioning.
     */
    provisioning?: AccountProvisioning;
    /**
     * Seconds of inactivity after which this person's sessions end, or nothing
     * for the shared default (14 days). See ./session-lifetime.
     */
    sessionLifetime?: SessionLifetime;
    /**
     * The product's own better-auth plugins for its domain (for example
     * `organization()` for workspaces). Mounted after AccountKit's own, so they
     * add endpoints and tables; they do not replace the shared sign-in methods.
     * Their tables must be in `schema`.
     */
    plugins?: BetterAuthPlugin[];
    mail: AuthMailer;
    env?: NodeJS.ProcessEnv;
    /**
     * `"uuid"`: every id the runtime mints (users included) is a random UUID.
     * For a product whose own rows reference its people by a `uuid` column, so
     * a person AccountKit creates (a first OIDC sign-in, its own sign-up) can be
     * given a product row under the same id. Ids already stored are untouched.
     * Default: better-auth's own random string ids.
     */
    ids?: "uuid";
    /**
     * When a password account must have confirmed its address. Default
     * "after-sign-in": no wall, a confirmation link is still mailed. See
     * EmailConfirmation in ./methods; pass the same value to signInMethods.
     */
    emailConfirmation?: EmailConfirmation;
    /**
     * Called as a sign-in method is attached to a person (a first sign-up
     * included), once the person exists. A product that used to identify people by another id — an
     * OrangeCat actor id, say — re-keys its own rows here. Must be idempotent;
     * a throw is logged and never blocks the sign-in.
     *
     * `tokens` are the provider's, for a product that acts at the provider on
     * the person's behalf (Loki publishing to OrangeCat) and keeps them in its
     * own table. AccountKit itself never stores provider tokens.
     *
     * A product whose mirror trigger records the same sign-in method in
     * AccountKit's table while this runs need not avoid it: that record, for
     * this person, gives way to AccountKit's own.
     *
     * A person created WITHOUT a sign-in method (a first email sign-in link) is
     * reported too, exactly once, as soon as they exist: `providerId` is
     * `NO_SIGN_IN_METHOD`, `accountId` their user id, `tokens` all null. So every
     * new person reaches this hook however they came in.
     */
    onAccountCreated?: (account: CreatedAccount) => Promise<void>;
    /**
     * Extra GitHub scopes for a product's own GitHub app (see productGithubApp),
     * beyond the identity ones: Loki asks for `repo` and `workflow`, which it
     * acts with. The token reaches onAccountCreated, never AccountKit's table.
     */
    githubScopes?: string[];
    /**
     * Called once a person's account is gone (AccountKit's account panel, or
     * any other path that deletes the user), so the product removes or
     * anonymises its own row. Runs only after the deletion, never for an account
     * that still exists: a product that must refuse a deletion does so before it
     * starts (a plugin `before` hook on `/delete-user`, which stops it before
     * anything is deleted). A throw is logged and does not undo the deletion,
     * so a product whose row must disappear atomically keeps a database trigger.
     */
    onAccountDeleted?: (account: DeletedAccount) => Promise<void>;
}
/**
 * The `providerId` onAccountCreated receives for a person created without a
 * sign-in method (an email sign-in link to a new address).
 */
export declare const NO_SIGN_IN_METHOD = "none";
/** A person whose account was just deleted. */
export interface DeletedAccount {
    userId: string;
    email: string;
}
/** A sign-in method as it is attached to a person. */
export interface CreatedAccount {
    userId: string;
    providerId: string;
    accountId: string;
    tokens: ProviderTokens;
}
/** What a provider handed over at sign-in; every field may be absent. */
export interface ProviderTokens {
    accessToken: string | null;
    refreshToken: string | null;
    idToken: string | null;
    accessTokenExpiresAt: Date | null;
    scope: string | null;
}
/** A product's own stored password format, read during migration. */
export interface LegacyPasswordFormat {
    matches: (hash: string) => boolean;
    verify: (password: string, hash: string) => Promise<boolean>;
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