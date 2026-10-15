import { type LimitResult } from "limitkit";
/**
 * Rate limits for the account endpoints, the same in every product.
 *
 * KEYED ON THE PROXY'S HOP, NEVER THE FIRST X-Forwarded-For ENTRY. limitkit's
 * `clientIp()` reads the LAST hop, the one Caddy appended, which the caller
 * cannot choose. `trustedProxies: 1` is Caddy on the box.
 */
export declare const authLimits: {
    /** Guessing a password, a code or a passkey assertion. */
    credential: import("limitkit").Limiter;
    /** Anything that sends an email: protects inboxes and the shared quota. */
    mail: import("limitkit").Limiter;
    /** The same, per recipient, so rotating IPs cannot flood one inbox. */
    mailTo: import("limitkit").Limiter;
    /** Everything else under /api/auth (session reads, sign-out, listing). */
    auth: import("limitkit").Limiter;
};
export type AuthBucket = "credential" | "mail" | "auth";
/** Which bucket a better-auth path (after /api/auth) spends from. */
export declare function authBucket(path: string): AuthBucket;
export declare function callerKey(headers: Headers, scope: string): string;
/** A recipient as a bucket key: hashed, so the limiter never holds an address. */
export declare function recipientKey(email: string): string;
export declare function tooMany(result: LimitResult): Response;
/** Returns a Response to send INSTEAD of handling the request, or null to go on. */
export declare function rateLimitAuthRequest(request: Request): Promise<Response | null>;
//# sourceMappingURL=limits.d.ts.map