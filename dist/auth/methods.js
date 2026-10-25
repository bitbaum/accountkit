import { createHash } from "node:crypto";
export const SIGNIN_PROVIDER_ID = "bitbaum-signin";
export const ORANGECAT_PROVIDER_ID = "orangecat";
export const ORANGECAT_DEFAULT_ISSUER = "https://orangecat.ch";
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
export function oidcClients(env) {
    return [signinBroker(env), orangecatOidc(env)].filter((c) => c !== null);
}
/** What the sign-in and sign-up pages offer. Safe to send to the browser: booleans only. */
export function signInMethods(env, mailConfigured) {
    const development = env.NODE_ENV === "development";
    return {
        passwordReset: mailConfigured,
        password: true,
        passkey: true,
        twoFactor: true,
        magicLink: mailConfigured || development,
        verifyEmail: mailConfigured,
        signin: signinBroker(env) !== null,
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