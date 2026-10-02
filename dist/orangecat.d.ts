export declare const ORANGECAT_PROVIDER_ID = "orangecat";
export declare const ORANGECAT_DEFAULT_ISSUER = "https://orangecat.ch";
/** Identity only. An app that acts on OrangeCat's behalf passes its own. */
export declare const ORANGECAT_IDENTITY_SCOPES = "openid profile email";
type Env = Record<string, string | undefined>;
/**
 * The issuer every OrangeCat token's `iss` carries. Not normalised: OIDC
 * compares `iss` byte for byte, so a trailing slash in the env is a
 * different issuer, exactly as discovery would treat it.
 */
export declare function orangecatIssuer(env?: Env): string;
export interface OrangecatClient {
    clientId: string;
    clientSecret: string;
    issuer: string;
}
/**
 * The client pair from the env names every app already uses, or null. Null
 * means the provider is ABSENT — an app hides the button rather than mount a
 * half-configured provider that fails opaquely at the code exchange.
 */
export declare function orangecatClient(env?: Env): OrangecatClient | null;
/** The id_token / userinfo claims OrangeCat sends. `sub` is the actor id. */
export interface OrangecatClaims {
    sub?: string | null;
    name?: string | null;
    preferred_username?: string | null;
    email?: string | null;
    picture?: string | null;
    [claim: string]: unknown;
}
/** What the provider hands Auth.js as "the user". */
export interface OrangecatProfileUser {
    id: string;
    name: string | null;
    image: string | null;
    /** The actor id again, under a name an adapter can key on. */
    orangecatSub: string;
    /** OrangeCat handle, without the @. */
    username: string | null;
    /** The OrangeCat address as CONTACT data, lower-cased. Never an identity. */
    contactEmail: string | null;
}
/**
 * Deliberately has NO `email` key. For an account it has not seen, Auth.js
 * calls `getUserByEmail(user.email)` and then either links the two (account
 * takeover, since the address is unverified) or refuses the sign-in
 * (OAuthAccountNotLinked). Without the key that lookup never runs, so a new
 * `sub` always becomes a new person. The address rides along as
 * `contactEmail`, for an app that wants to store it — see `contactEmailFor`.
 */
export declare function orangecatProfile(claims: OrangecatClaims): OrangecatProfileUser;
export interface OrangecatProviderOptions {
    clientId: string;
    clientSecret: string;
    issuer?: string;
    /** Space-separated. Defaults to identity only; must not exceed what
     *  OrangeCat registered for the client, or the consent screen refuses. */
    scopes?: string;
}
/** Auth.js v5 (`next-auth@5`). Spread into `providers: [...]`. */
export declare function orangecatProvider(options: OrangecatProviderOptions): {
    id: string;
    name: string;
    type: "oidc";
    issuer: string;
    clientId: string;
    clientSecret: string;
    client: {
        token_endpoint_auth_method: "client_secret_post";
    };
    checks: ("pkce" | "state")[];
    authorization: {
        params: {
            scope: string;
        };
    };
    profile: typeof orangecatProfile;
    allowDangerousEmailAccountLinking: boolean;
};
/** next-auth v4 (`next-auth@4`): an "oauth" provider with OIDC discovery. */
export declare function orangecatProviderV4(options: OrangecatProviderOptions): {
    id: string;
    name: string;
    type: "oauth";
    wellKnown: string;
    issuer: string;
    idToken: boolean;
    clientId: string;
    clientSecret: string;
    client: {
        token_endpoint_auth_method: "client_secret_post";
    };
    checks: ("pkce" | "state")[];
    authorization: {
        params: {
            scope: string;
        };
    };
    profile: typeof orangecatProfile;
    allowDangerousEmailAccountLinking: boolean;
};
export type EntryMode = "sign-in" | "sign-up";
/** The providers OrangeCat has switched on that an app may offer a button for. */
export declare const SOCIAL_PROVIDERS: readonly ["google", "github"];
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];
export declare function isSocialProvider(value: unknown): value is SocialProvider;
/**
 * The third argument to `signIn("orangecat", options, params)`. OrangeCat's
 * screen opens already in the state the person chose:
 *
 *   prompt=create   on "Create account" (OIDC Prompt Create 1.0)
 *   login_hint      the email they typed, pre-filled
 *   idp_hint        straight to Google or GitHub
 *
 * Auth.js merges these into the authorization URL verbatim, including over
 * its own parameters, so only these three keys are ever produced and every
 * value is checked first.
 */
export declare function authorizationParams(input: {
    mode?: EntryMode;
    email?: string | null;
    provider?: string | null;
}): Record<string, string>;
/**
 * Where to land after signing in: `from`, if it is a path on this site.
 * `from` arrives in a URL anyone can write, so `//evil.example` and
 * `/\evil.example` (which browsers read as protocol-relative) are refused.
 */
export declare function returnPath(from: unknown, fallback?: string): string;
export interface OcSessionClaims extends Record<string, unknown> {
    /** OrangeCat actor id (id_token.sub). Absent = not signed in. */
    actorId?: string;
    ocRefreshToken?: string;
    /** Access-token expiry, seconds since the epoch. */
    ocExpiresAt?: number;
    /** Earliest time (seconds) to retry after a transient refresh failure. */
    ocRetryAt?: number;
}
export interface OcTokenGrant {
    refresh_token?: string | null;
    expires_at?: number | null;
}
/** On sign-in: remember what OrangeCat handed over. */
export declare function bindOcTokens<T extends OcSessionClaims>(token: T, account: OcTokenGrant): T;
/** True when the access token has (nearly) expired and a retry is not on hold. */
export declare function ocRefreshDue(token: OcSessionClaims, nowSeconds: number): boolean;
export type OcRefreshResult = {
    ok: true;
    refreshToken: string;
    expiresAt: number;
} | {
    ok: false;
    revoked: true;
} | {
    ok: false;
    revoked: false;
    reason: string;
};
export interface OcRefreshDeps {
    issuer: string;
    clientId: string;
    clientSecret: string;
    fetch: typeof fetch;
    nowSeconds: number;
}
/** One refresh_token grant against OrangeCat's token endpoint. */
export declare function refreshOcTokens(refreshToken: string, deps: OcRefreshDeps): Promise<OcRefreshResult>;
/**
 * Apply a refresh outcome. Revoked → the identity is dropped, which is how
 * an app reads "signed out" (read `token.actorId`, never `token.sub`).
 * Transient → hold the retry for a minute.
 */
export declare function applyOcRefresh<T extends OcSessionClaims>(token: T, result: OcRefreshResult, nowSeconds: number): T;
/**
 * The whole of an app's `jwt()` callback for OrangeCat, in one call:
 *
 *   async jwt({ token, account, profile }) {
 *     return syncOcSession({ token, account, profile }, orangecat);
 *   }
 *
 * Sign-in: records the actor id and the tokens. Afterwards: refreshes when
 * due, and drops `actorId` when OrangeCat revoked the grant.
 */
export declare function syncOcSession<T extends OcSessionClaims>(input: {
    token: T;
    account?: (OcTokenGrant & {
        provider?: string;
    }) | null;
    profile?: {
        sub?: string | null;
    } | null;
}, client: OrangecatClient | null, deps?: {
    fetch?: typeof fetch;
    nowSeconds?: number;
}): Promise<T>;
/**
 * The address stored when the OrangeCat email already belongs to another
 * local user (or there is none). `.invalid` is reserved (RFC 2606): it can
 * never be delivered to, registered, or sent a reset link.
 */
export declare function placeholderEmail(sub: string): string;
export declare function isPlaceholderEmail(email: string | null | undefined): boolean;
/** The contact address to store for a new OrangeCat user: theirs when free. */
export declare function contactEmailFor(sub: string, wanted: string | null | undefined, taken: boolean): string;
/**
 * Whether a sign-in's email may earn ADMIN_EMAILS (or any email-list)
 * promotion. Never for OrangeCat: promoting on an unverified address makes
 * admin a matter of typing one into OrangeCat.
 */
export declare function emailEarnsPromotion(provider: string | null | undefined): boolean;
/**
 * Whether "forgot password" may email this account a reset link.
 *
 * A user OrangeCat created has no local password, and its address came from
 * OrangeCat unverified: a reset link would hand whoever really owns that
 * address a password on the OrangeCat person's account. A placeholder can
 * never receive mail. Anyone with a password of their own may reset it.
 */
export declare function mayReceivePasswordReset(user: {
    email: string | null | undefined;
    hasPassword: boolean;
    orangecatLinked: boolean;
}): boolean;
export type OrangecatRefusal = "already-linked" | "no-email" | "email-taken";
export type OrangecatDecision = {
    kind: "existing";
    userId: string;
} | {
    kind: "link";
    userId: string;
} | {
    kind: "create";
    email: string;
} | {
    kind: "refuse";
    reason: OrangecatRefusal;
};
export interface OrangecatPolicy {
    /** Another local account has this address. Default: a placeholder. evig
     *  refuses instead and sends the person to connect from their profile. */
    whenEmailTaken?: "placeholder" | "refuse";
    /** OrangeCat sent no address (an anonymous account). Default: placeholder. */
    whenNoEmail?: "placeholder" | "refuse";
}
/**
 * What an OrangeCat sign-in means for a local account. Pure; the adapter
 * wrapper and the JWT-only apps (evig) both decide through it.
 *
 *  - An explicit connect from a signed-in account wins: the person's own
 *    decision, made from inside their session.
 *  - A known `sub` signs in as its user.
 *  - Anything else creates a new user — never a match on email.
 */
export declare function decideOrangecatSignIn(input: {
    sub: string;
    contactEmail: string | null | undefined;
    /** The local user already carrying this sub. */
    byActor: {
        id: string;
    } | null;
    /** The signed-in user who asked to connect (link token / session). */
    linkFor: {
        id: string;
        orangecatSub: string | null;
    } | null;
    /** Whether another local user holds `contactEmail` (case-insensitive). */
    emailTaken: boolean;
}, policy?: OrangecatPolicy): OrangecatDecision;
/** The few database operations the OrangeCat identity rule needs. */
export interface OrangecatUserStore<U> {
    findBySub(sub: string): Promise<U | null>;
    /** Case-insensitive. */
    emailTaken(email: string): Promise<boolean>;
    insert(user: {
        orangecatSub: string;
        email: string;
        name: string | null;
        image: string | null;
    }): Promise<U>;
    /** Attach a sub to an existing user. False when they already hold a different one. */
    attachSub(userId: string, sub: string): Promise<boolean>;
}
/**
 * Find or create the local user for an OrangeCat identity — for apps that
 * resolve in a callback rather than through an adapter (datacat). Survives
 * the insert race datacat found: a concurrent sign-in of the same sub returns
 * that row; an address claimed between check and insert falls back to the
 * placeholder.
 */
export declare function resolveOrangecatUser<U>(store: OrangecatUserStore<U>, identity: {
    sub: string;
    contactEmail?: string | null;
    name?: string | null;
    image?: string | null;
}): Promise<U>;
export interface AdapterSlice {
    getUserByAccount?: (ref: never) => Promise<unknown>;
    createUser?: (user: never) => Promise<unknown>;
    linkAccount?: (account: never) => Promise<unknown>;
}
/**
 * Wrap an Auth.js adapter so an OrangeCat sign-in resolves its user by
 * `sub` alone. Every other provider passes straight through.
 *
 * `keepTokens: false` (default) stores no OrangeCat tokens — identity only,
 * and the sub column is the single source of truth for the link. An app that
 * calls OrangeCat on the person's behalf (loki) passes `true`, and the base
 * adapter also writes the accounts row.
 *
 * Linking an existing account is Auth.js's own path: sign in to the app,
 * then sign in with OrangeCat — `linkAccount` runs for the signed-in user,
 * never on the strength of an email match.
 */
export declare function withOrangecatIdentity<A extends AdapterSlice, U>(base: A, store: OrangecatUserStore<U>, options?: {
    keepTokens?: boolean;
}): A;
/**
 * For an app without an adapter, proof that THIS signed-in user asked to
 * connect OrangeCat: a cookie set by a POST from inside their session,
 * read back by the sign-in callback, good for ten minutes. The OrangeCat
 * identity that comes back attaches to that account and no other.
 *
 *   POST /api/user/orangecat      → set cookie mintLinkToken(user.id, AUTH_SECRET)
 *   signIn("orangecat")           → OrangeCat → callback
 *   signIn/jwt callback           → readLinkToken(cookie) → decideOrangecatSignIn({ linkFor })
 */
export declare const ORANGECAT_LINK_TTL_SECONDS: number;
/** `userId.expiresAt.signature`, minted for one signed-in user. */
export declare function mintLinkToken(userId: string, secret: string, nowMs?: number): string;
/** The user id the token was minted for, or null if forged, altered or expired. */
export declare function readLinkToken(token: string | null | undefined, secret: string, nowMs?: number): string | null;
export {};
//# sourceMappingURL=orangecat.d.ts.map