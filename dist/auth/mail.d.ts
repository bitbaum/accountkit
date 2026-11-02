import type { AuthMailer, AuthMailExtra, AuthMailKind, AuthSite } from "./server.js";
/** "123456" → "123 456": easier to read off one screen and type into another. */
export declare const spacedCode: (code: string) => string;
/** One account mail, in the product's own words and look. */
export interface RenderedAuthMail {
    subject: string;
    text: string;
    html?: string;
}
export interface AuthMailOptions {
    site: Pick<AuthSite, "title" | "url">;
    /** Read lazily so a build never captures deployment credentials. */
    env?: () => Record<string, string | undefined>;
    subjects?: Partial<Record<AuthMailKind, string>>;
    /**
     * The product's own template (its languages, its HTML). Gets the link and,
     * for a sign-in link, the code (`extra.code`); the transport, the origin
     * check and the undeliverable-address rule stay the mailer's.
     */
    render?: (kind: AuthMailKind, url: string, extra: AuthMailExtra) => RenderedAuthMail;
    /**
     * Whether `render` prints `extra.code`. Only then is a sign-in code minted.
     * Without `render` the shared template prints it, so this defaults to true.
     */
    codes?: boolean;
    /**
     * A product's own mail for one kind (evig confirms an address with its own
     * 6-digit code). Resolves true when it sent; false falls back to the shared
     * mail for that kind.
     */
    own?: Partial<Record<AuthMailKind, (to: string, url: string, extra: AuthMailExtra) => Promise<boolean>>>;
}
/** Shared account-mail adapter; a no-op sender is never reported as configured. */
export declare function createAuthMailer(options: AuthMailOptions): AuthMailer;
//# sourceMappingURL=mail.d.ts.map