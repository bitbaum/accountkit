/**
 * Which sign-in methods this deployment offers — a pure function of its env,
 * so "is this button shown" is a unit test, not a guess (fleet STACK.md,
 * "Identity", 2026-10-11).
 *
 *  - Email + password, passkeys and two-factor need nothing external.
 *  - A magic link needs mail (@bitbaum/mail-kit). Without it the option is
 *    HIDDEN in production rather than offered and silently undeliverable; in
 *    development the link is printed to the server console instead.
 *  - "bitbaum sign-in" is the shared sign-in service (Morulia) that holds the
 *    providers' credentials once and speaks OIDC to every app, issuing a
 *    per-app (pairwise) subject. Shown only when SIGNIN_* is set AND the
 *    service publishes at least one provider at <issuer>/api/providers; the
 *    button names exactly the providers it publishes, so an app never offers
 *    one that is not configured.
 *  - "Sign in with OrangeCat" is OrangeCat's OIDC provider: one click for
 *    people who already have OrangeCat, never a requirement. OrangeCat's token
 *    endpoint accepts ONLY client_secret_post and requires PKCE.
 *
 * A method whose env is missing is hidden, never broken.
 */
type Env = Record<string, string | undefined>;
export declare const SIGNIN_PROVIDER_ID = "bitbaum-signin";
export declare const ORANGECAT_PROVIDER_ID = "orangecat";
export declare const ORANGECAT_DEFAULT_ISSUER = "https://orangecat.ch";
export declare const GITHUB_PROVIDER_ID = "github";
export type OidcProviderId = typeof SIGNIN_PROVIDER_ID | typeof ORANGECAT_PROVIDER_ID;
export interface OidcClient {
    providerId: OidcProviderId;
    issuer: string;
    discoveryUrl: string;
    clientId: string;
    clientSecret: string;
}
/**
 * An issuer we are willing to send people to: https, or http on localhost for
 * development. Anything else is treated as not configured — a typo must hide
 * the button, not send someone's sign-in over plain HTTP.
 */
export declare function usableIssuer(value: string): string | null;
/** The shared bitbaum sign-in service (SIGNIN_ISSUER/CLIENT_ID/CLIENT_SECRET). */
export declare function signinBroker(env: Env): OidcClient | null;
/** OrangeCat, under the env names every fleet app already uses. */
export declare function orangecatOidc(env: Env): OidcClient | null;
/**
 * A product's own registered GitHub OAuth app (GITHUB_CLIENT_ID and
 * GITHUB_CLIENT_SECRET), for a product that had one before AccountKit and
 * keeps its callback, <site>/api/auth/callback/github. It brings that
 * product's GitHub sign-in, and the repository grant it acts with, across
 * unchanged. A product without its own app reaches GitHub through the bitbaum
 * sign-in instead. Both variables, or nothing.
 *
 * Opt-in: the app signs people in only when the product asks for it
 * (`githubSignIn: true`). The same two variables often hold an app a product
 * acts on repositories with and never meant as a way in (Loki), so their
 * presence alone offers nothing.
 */
export declare function productGithubApp(env: Env, signIn: boolean | undefined): {
    clientId: string;
    clientSecret: string;
} | null;
export declare function oidcClients(env: Env): OidcClient[];
/** ACCOUNTKIT_LIGHTNING=1 (or true) turns Lightning login on for a deployment. */
export declare function lightningOn(env: Env): boolean;
export interface SignInMethods {
    /** Recovery needs a real sender; absent on older capability objects. */
    passwordReset?: boolean;
    password: boolean;
    passkey: boolean;
    twoFactor: boolean;
    magicLink: boolean;
    /**
     * Whether an email must be confirmed before a password account signs in.
     * False by default: people sign in at once and confirm later (see
     * EmailConfirmation). True only for a product that opts in, with mail.
     */
    verifyEmail: boolean;
    signin: boolean;
    /**
     * What the shared sign-in's button names, in order ("Google", "GitHub"):
     * the providers the service publishes. Empty when `signin` is false.
     * Optional so a capability object built before 0.24 still type-checks.
     */
    signinProviders?: string[];
    orangecat: boolean;
    /**
     * Lightning login (LNURL-auth, ./lightning): the person's own wallet signs
     * a one-time challenge. Free, no key, no third party. Opt-in per deployment
     * with ACCOUNTKIT_LIGHTNING=1 until it is on everywhere.
     */
    lightning?: boolean;
    /** The product's own GitHub app signs people in (`githubSignIn: true`). */
    github?: boolean;
}
/**
 * When a password account must have confirmed its address.
 *
 *  - "after-sign-in" (the default for every product): sign-up signs the person
 *    in at once. With mail, a confirmation link is sent too; confirming is
 *    never a wall in front of using the product. A product that reserves some
 *    powers for confirmed addresses reads `user.emailVerified` itself.
 *  - "before-sign-in": a product that cannot let an unconfirmed address in
 *    opts into the wall. It applies only with mail, because without mail the
 *    link could never arrive.
 */
export type EmailConfirmation = "after-sign-in" | "before-sign-in";
export interface SignInMethodOptions {
    /** Pass the same value the server was created with. Default "after-sign-in". */
    emailConfirmation?: EmailConfirmation;
    /**
     * The shared sign-in's provider names, when the caller already has them
     * (tests, or a product that loaded them itself with `loadSigninProviders`).
     * Without it, the last list read from the service is used.
     */
    signinProviders?: readonly string[];
    /**
     * Pass the same `githubSignIn` the server was created with: the product's
     * own GitHub app then shows as "Continue with GitHub" (`methods.github`).
     */
    githubSignIn?: boolean;
}
/** The names in a /api/providers answer, or null when it is not one. */
export declare function parseSigninProviders(body: unknown): string[] | null;
/**
 * Reads the shared sign-in's provider list now and remembers it. Resolves to
 * the names, or null when SIGNIN_* is not set or the service did not answer
 * with a list (the last good list is kept). Never throws.
 */
export declare function loadSigninProviders(env: Env, fetchImpl?: typeof fetch): Promise<string[] | null>;
/**
 * The last provider list read from the shared sign-in, or null when none has
 * been read yet. Starts a background refresh when it is older than a minute.
 */
export declare function knownSigninProviders(env: Env): string[] | null;
/** Forgets every provider list read so far (tests). */
export declare function resetSigninProviders(): void;
/** What the sign-in and sign-up pages offer. Safe to send to the browser: booleans only. */
export declare function signInMethods(env: Env, mailConfigured: boolean, options?: SignInMethodOptions): SignInMethods;
/**
 * The address given to a person who signed in with a method that brought no
 * email, or whose email we do not trust as an identity.
 *
 * An address from a provider is CONTACT data, never an identity: linking by it
 * lets whoever controls an unverified address at the provider take over the
 * local account (fleet accountkit, `orangecatProfile`). So OIDC accounts never
 * carry the provider's address. `.invalid` is reserved (RFC 2606): it cannot
 * receive mail and cannot collide with a real address. Hashed so the
 * provider's subject is not readable from it.
 */
export declare function placeholderEmail(providerId: string, subject: string): string;
/** Whether mail can ever reach this address. */
export declare function isDeliverable(email: string | null | undefined): boolean;
export {};
//# sourceMappingURL=methods.d.ts.map