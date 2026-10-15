import { type Auth, type CreateAuthOptions, type AuthSite, type AuthMailer, type AuthStatus } from "./server.js";
export interface AuthRuntimeOptions {
    site: AuthSite;
    mail: AuthMailer;
    /** Whether the product has a database to keep accounts in. */
    isDatabaseConfigured: (env: NodeJS.ProcessEnv) => boolean;
    /** The Drizzle database. Called on first use, never at import. */
    getDatabase: () => unknown;
    /** Only if the product keeps the account tables under its own definitions. */
    schema?: Record<string, unknown>;
    /** See CreateAuthOptions.onAccountCreated. */
    onAccountCreated?: CreateAuthOptions["onAccountCreated"];
}
type SessionUser = {
    id: string;
    role?: unknown;
};
/**
 * Everything a Next.js product needs from accounts, from one call:
 *
 *   export const { GET, POST, getSession, requireUser, authStatus } =
 *     createAuthRuntime({ site, mail, isDatabaseConfigured, getDatabase });
 *
 * Built on first request, never at import: `next build` evaluates route
 * modules, and an instance built there would make the build need a database
 * and a secret. A running server without them answers "accounts unavailable"
 * on every auth surface instead of crashing.
 */
export declare function createAuthRuntime(options: AuthRuntimeOptions): {
    getAuth: () => Auth;
    authStatus: (env?: NodeJS.ProcessEnv) => AuthStatus;
    getSession: () => Promise<AuthSession | null>;
    requireUser: (request: Request) => Promise<{
        user: SessionUser;
        response?: never;
    } | {
        user?: never;
        response: Response;
    }>;
    GET: (request: Request) => Promise<Response>;
    POST: (request: Request) => Promise<Response>;
};
/** The signed-in person, as the products read them. */
export interface AuthSession {
    user: {
        id: string;
        name: string;
        email: string;
        emailVerified: boolean;
        image?: string | null;
        role?: string;
        twoFactorEnabled?: boolean;
    };
    session: {
        id: string;
        expiresAt: Date;
    };
}
export {};
//# sourceMappingURL=next.d.ts.map