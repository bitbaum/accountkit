/**
 * Which sign-in methods this deployment offers — a pure function of its env,
 * so "is this button shown" is a unit test, not a guess (fleet STACK.md,
 * "Identity", 2026-10-11).
 *
 *  - Email + password, passkeys and two-factor need nothing external.
 *  - A magic link needs mail (@bitbaum/mail-kit). Without it the option is
 *    HIDDEN in production rather than offered and silently undeliverable; in
 *    development the link is printed to the server console instead.
 *  - "bitbaum sign-in" is the shared sign-in service that holds the Google,
 *    GitHub, X, Meta and Apple credentials once and speaks OIDC to every app,
 *    issuing a per-app (pairwise) subject. Shown only when SIGNIN_* is set.
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
export declare function oidcClients(env: Env): OidcClient[];
export interface SignInMethods {
    /** Recovery needs a real sender; absent on older capability objects. */
    passwordReset?: boolean;
    password: boolean;
    passkey: boolean;
    twoFactor: boolean;
    magicLink: boolean;
    /** Whether an email must be confirmed before a password account signs in. */
    verifyEmail: boolean;
    signin: boolean;
    orangecat: boolean;
}
/** What the sign-in and sign-up pages offer. Safe to send to the browser: booleans only. */
export declare function signInMethods(env: Env, mailConfigured: boolean): SignInMethods;
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