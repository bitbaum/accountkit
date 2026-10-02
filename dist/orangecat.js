/**
 * "Sign in with OrangeCat" — the one copy.
 *
 * Nine apps wrote this themselves (loki, solon, heidi, skif, substrata,
 * petvity, surf-your-life, evig, datacat), and each learned something the
 * others had not. This module is all of it, once:
 *
 *  - the provider (Auth.js v5, and next-auth v4) with the two settings every
 *    app paid a debugging cycle for: `client_secret_post` and PKCE;
 *  - a profile with NO `email`, so Auth.js never looks a user up, or links
 *    one, by an address OrangeCat did not verify;
 *  - the session refresh that ends a session OrangeCat revoked (heidi, solon);
 *  - the entry parameters: create-account, login hint, Google/GitHub (solon);
 *  - the protections the user-table apps each wrote: identity keyed on `sub`,
 *    a `.invalid` placeholder when the address is taken, no ADMIN_EMAILS
 *    promotion and no local password reset on the strength of an OrangeCat
 *    email (petvity, surf-your-life, datacat, evig);
 *  - evig's "Connect OrangeCat" link token, for linking an account the person
 *    is already signed in to.
 *
 * Server-only (it signs with node:crypto) and free of any next-auth import:
 * the types below are structural, so the same file serves Auth.js v5 and
 * next-auth v4, and every rule is testable under plain `node --test`.
 *
 * Why email is never the key: OrangeCat's auth backend auto-confirms
 * addresses, so `email_verified` is not proof that the person owns the
 * address. Anyone can register someone else's email on OrangeCat. The `sub`
 * (OrangeCat's actor id) is the only identity an app may key on.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
// ── Where OrangeCat is ──────────────────────────────────────────────────────
export const ORANGECAT_PROVIDER_ID = "orangecat";
export const ORANGECAT_DEFAULT_ISSUER = "https://orangecat.ch";
/** Identity only. An app that acts on OrangeCat's behalf passes its own. */
export const ORANGECAT_IDENTITY_SCOPES = "openid profile email";
/**
 * The issuer every OrangeCat token's `iss` carries. Not normalised: OIDC
 * compares `iss` byte for byte, so a trailing slash in the env is a
 * different issuer, exactly as discovery would treat it.
 */
export function orangecatIssuer(env = process.env) {
    return env.ORANGECAT_OAUTH_ISSUER?.trim() || ORANGECAT_DEFAULT_ISSUER;
}
/**
 * The client pair from the env names every app already uses, or null. Null
 * means the provider is ABSENT — an app hides the button rather than mount a
 * half-configured provider that fails opaquely at the code exchange.
 */
export function orangecatClient(env = process.env) {
    const clientId = env.ORANGECAT_OAUTH_CLIENT_ID?.trim();
    const clientSecret = env.ORANGECAT_OAUTH_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret)
        return null;
    return { clientId, clientSecret, issuer: orangecatIssuer(env) };
}
/**
 * Deliberately has NO `email` key. For an account it has not seen, Auth.js
 * calls `getUserByEmail(user.email)` and then either links the two (account
 * takeover, since the address is unverified) or refuses the sign-in
 * (OAuthAccountNotLinked). Without the key that lookup never runs, so a new
 * `sub` always becomes a new person. The address rides along as
 * `contactEmail`, for an app that wants to store it — see `contactEmailFor`.
 */
export function orangecatProfile(claims) {
    const sub = typeof claims.sub === "string" ? claims.sub.trim() : "";
    if (!sub)
        throw new Error("OrangeCat id_token has no sub");
    const text = (v) => typeof v === "string" && v.trim() ? v.trim() : null;
    const email = text(claims.email);
    return {
        id: sub,
        name: text(claims.name) ?? text(claims.preferred_username),
        image: text(claims.picture),
        orangecatSub: sub,
        username: text(claims.preferred_username)?.replace(/^@/, "") ?? null,
        contactEmail: email ? email.toLowerCase() : null,
    };
}
/**
 * The two settings that are not taste:
 *
 *  - `client_secret_post`. OrangeCat's token endpoint accepts only that.
 *    Auth.js defaults to `client_secret_basic`, which OrangeCat answers at the
 *    code exchange with a 400 reading "client_id is required" — a message that
 *    points at the wrong problem entirely.
 *  - PKCE, even for a confidential client that holds a secret.
 *
 * A silent revert of either surfaces as an opaque failure at the code
 * exchange, the least debuggable place for it; the contract tests pin both.
 */
const TOKEN_AUTH = {
    token_endpoint_auth_method: "client_secret_post",
};
const CHECKS = ["pkce", "state"];
/** Auth.js v5 (`next-auth@5`). Spread into `providers: [...]`. */
export function orangecatProvider(options) {
    return {
        id: ORANGECAT_PROVIDER_ID,
        name: "OrangeCat",
        type: "oidc",
        issuer: options.issuer ?? orangecatIssuer(),
        clientId: options.clientId,
        clientSecret: options.clientSecret,
        client: { ...TOKEN_AUTH },
        checks: [...CHECKS],
        authorization: {
            params: { scope: options.scopes ?? ORANGECAT_IDENTITY_SCOPES },
        },
        profile: orangecatProfile,
        // Never let anyone flip this on: the address is not verified.
        allowDangerousEmailAccountLinking: false,
    };
}
/** next-auth v4 (`next-auth@4`): an "oauth" provider with OIDC discovery. */
export function orangecatProviderV4(options) {
    const issuer = (options.issuer ?? orangecatIssuer()).replace(/\/+$/, "");
    return {
        id: ORANGECAT_PROVIDER_ID,
        name: "OrangeCat",
        type: "oauth",
        wellKnown: `${issuer}/.well-known/openid-configuration`,
        issuer,
        idToken: true,
        clientId: options.clientId,
        clientSecret: options.clientSecret,
        client: { ...TOKEN_AUTH },
        checks: [...CHECKS],
        authorization: {
            params: { scope: options.scopes ?? ORANGECAT_IDENTITY_SCOPES },
        },
        profile: orangecatProfile,
        allowDangerousEmailAccountLinking: false,
    };
}
/** The providers OrangeCat has switched on that an app may offer a button for. */
export const SOCIAL_PROVIDERS = ["google", "github"];
const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,255}$/;
export function isSocialProvider(value) {
    return (typeof value === "string" &&
        SOCIAL_PROVIDERS.includes(value));
}
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
export function authorizationParams(input) {
    const params = {};
    if (input.mode === "sign-up")
        params.prompt = "create";
    const email = input.email?.trim();
    if (email && EMAIL.test(email))
        params.login_hint = email;
    if (isSocialProvider(input.provider))
        params.idp_hint = input.provider;
    return params;
}
/**
 * Where to land after signing in: `from`, if it is a path on this site.
 * `from` arrives in a URL anyone can write, so `//evil.example` and
 * `/\evil.example` (which browsers read as protocol-relative) are refused.
 */
export function returnPath(from, fallback = "/") {
    if (typeof from !== "string" || !from.startsWith("/"))
        return fallback;
    if (from.startsWith("//") || from.startsWith("/\\"))
        return fallback;
    if ([...from].some((c) => c.charCodeAt(0) < 0x20))
        return fallback;
    return from;
}
// ── The session: ends when OrangeCat says so ────────────────────────────────
/**
 * A JWT session would otherwise outlive anything OrangeCat does: a person who
 * clicks Disconnect on OrangeCat's Connected apps page, or Sign out
 * everywhere, stayed signed in until the cookie expired weeks later (observed
 * on production 2026-09-29). So the JWT carries the refresh token and the
 * access token's expiry. While the access token is valid the session is
 * trusted as is — OrangeCat's documented bound: a revocation reaches a
 * session within the access-token lifetime, one hour. Once it expires, the
 * app refreshes. `invalid_grant` means the access was taken back and the
 * session ends; anything else (network, 5xx) keeps the session and retries a
 * minute later, so an OrangeCat outage does not sign everyone out.
 *
 * Safe inside `jwt()` since orangecat#1212: a confidential client's refresh
 * token is echoed back unchanged, so a render that discards the rewritten
 * cookie loses nothing but the new expiry.
 */
const REFRESH_MARGIN_SECONDS = 60;
const RETRY_AFTER_SECONDS = 60;
/** On sign-in: remember what OrangeCat handed over. */
export function bindOcTokens(token, account) {
    if (account.refresh_token)
        token.ocRefreshToken = account.refresh_token;
    if (typeof account.expires_at === "number")
        token.ocExpiresAt = account.expires_at;
    delete token.ocRetryAt;
    return token;
}
/** True when the access token has (nearly) expired and a retry is not on hold. */
export function ocRefreshDue(token, nowSeconds) {
    if (!token.actorId ||
        !token.ocRefreshToken ||
        typeof token.ocExpiresAt !== "number") {
        return false;
    }
    if (typeof token.ocRetryAt === "number" && nowSeconds < token.ocRetryAt)
        return false;
    return nowSeconds >= token.ocExpiresAt - REFRESH_MARGIN_SECONDS;
}
/** One refresh_token grant against OrangeCat's token endpoint. */
export async function refreshOcTokens(refreshToken, deps) {
    const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: deps.clientId,
        client_secret: deps.clientSecret,
    });
    let res;
    try {
        res = await deps.fetch(`${deps.issuer.replace(/\/+$/, "")}/oauth/token`, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body,
        });
    }
    catch (e) {
        return {
            ok: false,
            revoked: false,
            reason: e instanceof Error ? e.message : "fetch failed",
        };
    }
    let json = {};
    try {
        json = (await res.json());
    }
    catch {
        // a non-JSON body is judged by its status below
    }
    if (res.ok && typeof json.expires_in === "number") {
        return {
            ok: true,
            // Confidential clients get the same token back (orangecat#1212);
            // public clients still rotate. Keep the old one only if none came.
            refreshToken: json.refresh_token ?? refreshToken,
            expiresAt: deps.nowSeconds + json.expires_in,
        };
    }
    // invalid_grant is OrangeCat's word for "revoked, expired or reused" — the
    // only answer that means the person (or OrangeCat) took the access back.
    if (res.status === 400 && json.error === "invalid_grant")
        return { ok: false, revoked: true };
    return {
        ok: false,
        revoked: false,
        reason: `${res.status} ${json.error ?? ""}`.trim(),
    };
}
/**
 * Apply a refresh outcome. Revoked → the identity is dropped, which is how
 * an app reads "signed out" (read `token.actorId`, never `token.sub`).
 * Transient → hold the retry for a minute.
 */
export function applyOcRefresh(token, result, nowSeconds) {
    if (result.ok) {
        token.ocRefreshToken = result.refreshToken;
        token.ocExpiresAt = result.expiresAt;
        delete token.ocRetryAt;
        return token;
    }
    if (result.revoked) {
        delete token.actorId;
        delete token.ocRefreshToken;
        delete token.ocExpiresAt;
        delete token.ocRetryAt;
        return token;
    }
    token.ocRetryAt = nowSeconds + RETRY_AFTER_SECONDS;
    return token;
}
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
export async function syncOcSession(input, client, deps = {}) {
    const { token, account, profile } = input;
    if (account?.provider === ORANGECAT_PROVIDER_ID) {
        // id_token.sub is the actor id: the identity boundary, never the email.
        if (profile?.sub)
            token.actorId = profile.sub;
        return bindOcTokens(token, account);
    }
    const nowSeconds = deps.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (!client || !ocRefreshDue(token, nowSeconds))
        return token;
    const result = await refreshOcTokens(token.ocRefreshToken, {
        ...client,
        fetch: deps.fetch ?? fetch,
        nowSeconds,
    });
    return applyOcRefresh(token, result, nowSeconds);
}
// ── Apps with their own user table ──────────────────────────────────────────
/**
 * The address stored when the OrangeCat email already belongs to another
 * local user (or there is none). `.invalid` is reserved (RFC 2606): it can
 * never be delivered to, registered, or sent a reset link.
 */
export function placeholderEmail(sub) {
    return `orangecat-${sub.replace(/[^a-zA-Z0-9-]/g, "")}@users.invalid`;
}
export function isPlaceholderEmail(email) {
    return (typeof email === "string" &&
        /^orangecat-[a-zA-Z0-9-]*@users\.invalid$/i.test(email));
}
/** The contact address to store for a new OrangeCat user: theirs when free. */
export function contactEmailFor(sub, wanted, taken) {
    const email = wanted?.trim().toLowerCase();
    return email && !taken ? email : placeholderEmail(sub);
}
/**
 * Whether a sign-in's email may earn ADMIN_EMAILS (or any email-list)
 * promotion. Never for OrangeCat: promoting on an unverified address makes
 * admin a matter of typing one into OrangeCat.
 */
export function emailEarnsPromotion(provider) {
    return provider !== ORANGECAT_PROVIDER_ID;
}
/**
 * Whether "forgot password" may email this account a reset link.
 *
 * A user OrangeCat created has no local password, and its address came from
 * OrangeCat unverified: a reset link would hand whoever really owns that
 * address a password on the OrangeCat person's account. A placeholder can
 * never receive mail. Anyone with a password of their own may reset it.
 */
export function mayReceivePasswordReset(user) {
    if (!user.email || isPlaceholderEmail(user.email))
        return false;
    if (user.hasPassword)
        return true;
    return !user.orangecatLinked;
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
export function decideOrangecatSignIn(input, policy = {}) {
    const { sub, byActor, linkFor } = input;
    if (linkFor) {
        if (byActor && byActor.id !== linkFor.id)
            return { kind: "refuse", reason: "already-linked" };
        if (linkFor.orangecatSub && linkFor.orangecatSub !== sub) {
            return { kind: "refuse", reason: "already-linked" };
        }
        return { kind: "link", userId: linkFor.id };
    }
    if (byActor)
        return { kind: "existing", userId: byActor.id };
    const email = input.contactEmail?.trim().toLowerCase() || null;
    if (!email && policy.whenNoEmail === "refuse")
        return { kind: "refuse", reason: "no-email" };
    if (email && input.emailTaken && policy.whenEmailTaken === "refuse") {
        return { kind: "refuse", reason: "email-taken" };
    }
    return {
        kind: "create",
        email: contactEmailFor(sub, email, input.emailTaken),
    };
}
/**
 * Find or create the local user for an OrangeCat identity — for apps that
 * resolve in a callback rather than through an adapter (datacat). Survives
 * the insert race datacat found: a concurrent sign-in of the same sub returns
 * that row; an address claimed between check and insert falls back to the
 * placeholder.
 */
export async function resolveOrangecatUser(store, identity) {
    const sub = identity.sub?.trim();
    if (!sub)
        throw new Error("OrangeCat identity has no sub");
    const existing = await store.findBySub(sub);
    if (existing)
        return existing;
    const wanted = identity.contactEmail?.trim().toLowerCase() || null;
    const taken = wanted ? await store.emailTaken(wanted) : false;
    const row = {
        orangecatSub: sub,
        email: contactEmailFor(sub, wanted, taken),
        name: identity.name ?? null,
        image: identity.image ?? null,
    };
    try {
        return await store.insert(row);
    }
    catch (err) {
        const raced = await store.findBySub(sub);
        if (raced)
            return raced;
        if (isPlaceholderEmail(row.email))
            throw err;
        return store.insert({ ...row, email: placeholderEmail(sub) });
    }
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
export function withOrangecatIdentity(base, store, options = {}) {
    const call = (name, arg) => {
        const fn = base[name];
        if (!fn)
            throw new Error(`base adapter has no ${name}`);
        return fn.call(base, arg);
    };
    return {
        ...base,
        async getUserByAccount(ref) {
            if (ref.provider === ORANGECAT_PROVIDER_ID)
                return store.findBySub(ref.providerAccountId);
            return base.getUserByAccount ? call("getUserByAccount", ref) : null;
        },
        async createUser(user) {
            const sub = typeof user.orangecatSub === "string" ? user.orangecatSub : "";
            if (!sub)
                return call("createUser", user);
            return resolveOrangecatUser(store, {
                sub,
                contactEmail: typeof user.contactEmail === "string" ? user.contactEmail : null,
                name: typeof user.name === "string" ? user.name : null,
                image: typeof user.image === "string" ? user.image : null,
            });
        },
        async linkAccount(account) {
            if (account.provider === ORANGECAT_PROVIDER_ID) {
                const ok = await store.attachSub(account.userId, account.providerAccountId);
                if (!ok)
                    throw new Error("This account is already connected to a different OrangeCat login");
                if (!options.keepTokens)
                    return null;
            }
            if (base.linkAccount)
                await call("linkAccount", account);
            return null;
        },
    };
}
// ── "Connect OrangeCat" from a signed-in account (evig's pattern) ───────────
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
export const ORANGECAT_LINK_TTL_SECONDS = 10 * 60;
function hmac(payload, secret) {
    return createHmac("sha256", secret).update(payload).digest("base64url");
}
/** `userId.expiresAt.signature`, minted for one signed-in user. */
export function mintLinkToken(userId, secret, nowMs = Date.now()) {
    if (!secret)
        throw new Error("mintLinkToken needs a secret");
    if (!userId || userId.includes("."))
        throw new Error("mintLinkToken: bad user id");
    const payload = `${userId}.${Math.floor(nowMs / 1000) + ORANGECAT_LINK_TTL_SECONDS}`;
    return `${payload}.${hmac(payload, secret)}`;
}
/** The user id the token was minted for, or null if forged, altered or expired. */
export function readLinkToken(token, secret, nowMs = Date.now()) {
    if (!token || !secret)
        return null;
    const parts = token.split(".");
    if (parts.length !== 3)
        return null;
    const [userId, expires, signature] = parts;
    const a = Buffer.from(signature);
    const b = Buffer.from(hmac(`${userId}.${expires}`, secret));
    if (a.length !== b.length || !timingSafeEqual(a, b))
        return null;
    if (!/^\d+$/.test(expires) || Number(expires) * 1000 < nowMs)
        return null;
    return userId || null;
}
//# sourceMappingURL=orangecat.js.map