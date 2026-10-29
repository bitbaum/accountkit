import { createHash } from "node:crypto";
import { clientIp, slidingWindow, toHeaders } from "limitkit";
/**
 * Rate limits for the account endpoints, the same in every product.
 *
 * KEYED ON THE PROXY'S HOP, NEVER THE FIRST X-Forwarded-For ENTRY. limitkit's
 * `clientIp()` reads the LAST hop, the one Caddy appended, which the caller
 * cannot choose. `trustedProxies: 1` is Caddy on the box.
 */
export const authLimits = {
    /** Guessing a password, a code or a passkey assertion. */
    credential: slidingWindow({ limit: 10, windowMs: 15 * 60_000 }),
    /** Anything that sends an email: protects inboxes and the shared quota. */
    mail: slidingWindow({ limit: 5, windowMs: 60 * 60_000 }),
    /** The same, per recipient, so rotating IPs cannot flood one inbox. */
    mailTo: slidingWindow({ limit: 3, windowMs: 60 * 60_000 }),
    /** Everything else under /api/auth (session reads, sign-out, listing). */
    auth: slidingWindow({ limit: 300, windowMs: 10 * 60_000 }),
};
const MAIL = new Set([
    "/sign-up/email",
    "/sign-in/magic-link",
    "/send-verification-email",
    "/request-password-reset",
    "/forget-password",
    "/change-email",
]);
const CREDENTIAL_PREFIXES = [
    "/sign-in/email",
    "/sign-in/domain",
    "/sign-in/social",
    "/reset-password",
    "/change-password",
    "/verify-password",
    "/two-factor/",
    "/passkey/verify-authentication",
    "/passkey/generate-authenticate-options",
    "/magic-link/verify",
    "/delete-user",
];
/** Which bucket a better-auth path (after /api/auth) spends from. */
export function authBucket(path) {
    if (MAIL.has(path))
        return "mail";
    if (CREDENTIAL_PREFIXES.some((p) => path === p || path.startsWith(p)))
        return "credential";
    return "auth";
}
export function callerKey(headers, scope) {
    return `${scope}:${clientIp(headers, { trustedProxies: 1 })}`;
}
/** A recipient as a bucket key: hashed, so the limiter never holds an address. */
export function recipientKey(email) {
    return `mail-to:${createHash("sha256").update(email.trim().toLowerCase()).digest("hex")}`;
}
export function tooMany(result) {
    return Response.json({ error: "rate_limited", retryAfterSeconds: result.retryAfterSeconds }, {
        status: 429,
        headers: { ...toHeaders(result), "Cache-Control": "no-store" },
    });
}
/** The address a mail-sending request would write to, read from a CLONE of its body. */
async function recipientOf(request) {
    try {
        const body = await request.clone().json();
        const fields = body ?? {};
        const value = typeof fields.email === "string" ? fields.email : fields.newEmail;
        return typeof value === "string" && value.includes("@") ? value : null;
    }
    catch {
        return null;
    }
}
/** Returns a Response to send INSTEAD of handling the request, or null to go on. */
export async function rateLimitAuthRequest(request) {
    const path = new URL(request.url).pathname.replace(/^\/api\/auth/, "") || "/";
    const bucket = request.method === "GET" ? "auth" : authBucket(path);
    const byCaller = authLimits[bucket].check(callerKey(request.headers, `auth-${bucket}`));
    if (!byCaller.allowed)
        return tooMany(byCaller);
    if (bucket === "mail") {
        const email = await recipientOf(request);
        if (email) {
            const byRecipient = authLimits.mailTo.check(recipientKey(email));
            if (!byRecipient.allowed)
                return tooMany(byRecipient);
        }
    }
    return null;
}
//# sourceMappingURL=limits.js.map