import type { BetterAuthPlugin } from "better-auth";
/**
 * A sign-in code in the sign-in link's email.
 *
 * The link opens wherever the mail app opens it: often another browser, or
 * another device, than the one the person asked on. The same email now also
 * carries a six-digit code to type on the page that asked for it. It is the
 * same method (an email that proves the address), so it needs nothing beyond
 * the mail a product already sends, and no third party.
 *
 * - A code is minted only together with a sign-in link, and travels only in
 *   that email. better-auth's own "send me a code" endpoint and its code-based
 *   reset, verification and email-change endpoints stay closed: recovery keeps
 *   its one path (a reset link), with its address and session rules.
 * - Six digits, ten minutes, three tries, stored hashed. Guessing spends the
 *   credential bucket (`/sign-in/email-otp` falls under `/sign-in/email`).
 * - A second factor applies to it as to every other way in (./factor).
 * - Only a mailer that says it can carry a code (`codes: true`, which
 *   `createAuthMailer` does) gets one. The link request then answers
 *   `{ code: true }`, so the screens offer the field only when the mail has it.
 */
export declare const SIGN_IN_CODE_LENGTH = 6;
export declare const SIGN_IN_CODE_SECONDS: number;
export declare const SIGN_IN_CODE_TRIES = 3;
/** Paths of better-auth's email-OTP plugin that AccountKit does not offer. */
export declare function closedCodePath(path: string | undefined): boolean;
export declare function signInCodePlugins(): BetterAuthPlugin[];
/** Mint the code that rides in the sign-in link's email. */
export declare function mintSignInCode(api: unknown, email: string): Promise<string | undefined>;
//# sourceMappingURL=sign-in-code.d.ts.map