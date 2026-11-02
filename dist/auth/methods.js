import { createHash } from "node:crypto";
export const SIGNIN_PROVIDER_ID = "bitbaum-signin";
export const ORANGECAT_PROVIDER_ID = "orangecat";
export const ORANGECAT_DEFAULT_ISSUER = "https://orangecat.ch";
export const GITHUB_PROVIDER_ID = "github";
const text = (value) => value?.trim() || "";
/**
 * An issuer we are willing to send people to: https, or http on localhost for
 * development. Anything else is treated as not configured — a typo must hide
 * the button, not send someone's sign-in over plain HTTP.
 */
export function usableIssuer(value) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        return null;
    }
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local))
        return null;
    if (url.search || url.hash || url.username || url.password)
        return null;
    // OIDC compares `iss` byte for byte; normalise only the trailing slash used
    // to build the discovery URL, never the issuer itself.
    return value;
}
function oidcClient(providerId, issuerValue, clientId, clientSecret) {
    if (!issuerValue || !clientId || !clientSecret)
        return null;
    const issuer = usableIssuer(issuerValue);
    if (!issuer)
        return null;
    return {
        providerId,
        issuer,
        discoveryUrl: `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`,
        clientId,
        clientSecret,
    };
}
/** The shared bitbaum sign-in service (SIGNIN_ISSUER/CLIENT_ID/CLIENT_SECRET). */
export function signinBroker(env) {
    return oidcClient(SIGNIN_PROVIDER_ID, text(env.SIGNIN_ISSUER), text(env.SIGNIN_CLIENT_ID), text(env.SIGNIN_CLIENT_SECRET));
}
/** OrangeCat, under the env names every fleet app already uses. */
export function orangecatOidc(env) {
    return oidcClient(ORANGECAT_PROVIDER_ID, text(env.ORANGECAT_OAUTH_ISSUER) || ORANGECAT_DEFAULT_ISSUER, text(env.ORANGECAT_OAUTH_CLIENT_ID), text(env.ORANGECAT_OAUTH_CLIENT_SECRET));
}
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
export function productGithubApp(env, signIn) {
    if (signIn !== true)
        return null;
    const clientId = text(env.GITHUB_CLIENT_ID);
    const clientSecret = text(env.GITHUB_CLIENT_SECRET);
    return clientId && clientSecret ? { clientId, clientSecret } : null;
}
export function oidcClients(env) {
    return [signinBroker(env), orangecatOidc(env)].filter((c) => c !== null);
}
/**
 * The providers the shared sign-in publishes, read from the service itself
 * (<issuer>/api/providers) and kept per issuer for a minute. `signInMethods`
 * is synchronous and called while a page renders, so it reads this cache and
 * starts a refresh in the background when the entry is missing or old. Until
 * the first answer arrives the button is HIDDEN: a button that names a
 * provider the service has not switched on is worse than none. A failed read
 * keeps the last good list.
 */
const PROVIDERS_TTL_MS = 60_000;
const PROVIDERS_TIMEOUT_MS = 5_000;
const providerCache = new Map();
function providersUrl(issuer) {
    return `${issuer.replace(/\/+$/, "")}/api/providers`;
}
/** The names in a /api/providers answer, or null when it is not one. */
export function parseSigninProviders(body) {
    const list = body?.providers;
    if (!Array.isArray(list))
        return null;
    const names = [];
    for (const item of list) {
        const label = item?.label;
        if (typeof label !== "string" || !label.trim() || label.length > 40)
            return null;
        names.push(label.trim());
    }
    return names;
}
/**
 * Reads the shared sign-in's provider list now and remembers it. Resolves to
 * the names, or null when SIGNIN_* is not set or the service did not answer
 * with a list (the last good list is kept). Never throws.
 */
export async function loadSigninProviders(env, fetchImpl = fetch) {
    const broker = signinBroker(env);
    if (!broker)
        return null;
    const key = broker.issuer;
    const entry = providerCache.get(key) ?? {
        names: null,
        tried: 0,
        pending: null,
    };
    providerCache.set(key, entry);
    if (entry.pending)
        return entry.pending;
    entry.tried = Date.now();
    entry.pending = (async () => {
        try {
            const response = await fetchImpl(providersUrl(key), {
                headers: { accept: "application/json" },
                signal: AbortSignal.timeout(PROVIDERS_TIMEOUT_MS),
            });
            const names = response.ok
                ? parseSigninProviders(await response.json())
                : null;
            if (names)
                entry.names = names;
            return names ?? entry.names;
        }
        catch {
            return entry.names;
        }
        finally {
            entry.pending = null;
        }
    })();
    return entry.pending;
}
/**
 * The last provider list read from the shared sign-in, or null when none has
 * been read yet. Starts a background refresh when it is older than a minute.
 */
export function knownSigninProviders(env) {
    const broker = signinBroker(env);
    if (!broker)
        return null;
    const entry = providerCache.get(broker.issuer);
    if (!entry || Date.now() - entry.tried > PROVIDERS_TTL_MS)
        void loadSigninProviders(env);
    return entry?.names ?? null;
}
/** Forgets every provider list read so far (tests). */
export function resetSigninProviders() {
    providerCache.clear();
}
/** What the sign-in and sign-up pages offer. Safe to send to the browser: booleans only. */
export function signInMethods(env, mailConfigured, options = {}) {
    const development = env.NODE_ENV === "development";
    const names = signinBroker(env) === null
        ? null
        : options.signinProviders
            ? [...options.signinProviders]
            : knownSigninProviders(env);
    return {
        passwordReset: mailConfigured,
        password: true,
        passkey: true,
        twoFactor: true,
        magicLink: mailConfigured || development,
        verifyEmail: mailConfigured && options.emailConfirmation === "before-sign-in",
        signin: (names?.length ?? 0) > 0,
        signinProviders: names ?? [],
        orangecat: orangecatOidc(env) !== null,
    };
}
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
export function placeholderEmail(providerId, subject) {
    const digest = createHash("sha256")
        .update(`${providerId}:${subject}`)
        .digest("hex")
        .slice(0, 32);
    return `${digest}@${providerId}.invalid`;
}
/** Whether mail can ever reach this address. */
export function isDeliverable(email) {
    if (!email)
        return false;
    const domain = email.split("@")[1]?.toLowerCase() ?? "";
    return domain.length > 0 && !domain.endsWith(".invalid");
}
//# sourceMappingURL=methods.js.map