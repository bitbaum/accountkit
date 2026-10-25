import type { AuthMailer, AuthMailKind, AuthSite } from "./server.js";
export interface AuthMailOptions {
    site: Pick<AuthSite, "title" | "url">;
    /** Read lazily so a build never captures deployment credentials. */
    env?: () => Record<string, string | undefined>;
    subjects?: Partial<Record<AuthMailKind, string>>;
}
/** Shared account-mail adapter; a no-op sender is never reported as configured. */
export declare function createAuthMailer(options: AuthMailOptions): AuthMailer;
//# sourceMappingURL=mail.d.ts.map