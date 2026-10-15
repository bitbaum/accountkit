import { headers } from "next/headers.js";
import { toNextJsHandler } from "better-auth/next-js";
import { rateLimitAuthRequest } from "./limits.js";
import {
  authStatusFor,
  createAuthInstance,
  type Auth,
  type AuthSite,
  type AuthMailer,
  type AuthStatus,
} from "./server.js";

export interface AuthRuntimeOptions {
  site: AuthSite;
  mail: AuthMailer;
  /** Whether the product has a database to keep accounts in. */
  isDatabaseConfigured: (env: NodeJS.ProcessEnv) => boolean;
  /** The Drizzle database. Called on first use, never at import. */
  getDatabase: () => unknown;
  /** Only if the product keeps the account tables under its own definitions. */
  schema?: Record<string, unknown>;
}

type SessionUser = { id: string; role?: unknown };

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
export function createAuthRuntime(options: AuthRuntimeOptions) {
  let instance: Auth | null = null;
  const getAuth = (): Auth => {
    instance ??= createAuthInstance({
      site: options.site,
      mail: options.mail,
      schema: options.schema,
      database: options.getDatabase(),
    });
    return instance;
  };
  const authStatus = (env: NodeJS.ProcessEnv = process.env): AuthStatus =>
    authStatusFor(options.isDatabaseConfigured(env), env);
  const noStore = { "Cache-Control": "no-store" };

  /** Who is signed in, for a server component. Null also when accounts are unavailable. */
  async function getSession() {
    if (!authStatus().ready) return null;
    try {
      return (await getAuth().api.getSession({
        headers: await headers(),
      })) as AuthSession | null;
    } catch (error) {
      console.error(`[auth] session read failed: ${(error as Error).name}`);
      return null;
    }
  }

  /** The signed-in person behind an API request, or the Response to send instead. */
  async function requireUser(
    request: Request,
  ): Promise<
    | { user: SessionUser; response?: never }
    | { user?: never; response: Response }
  > {
    if (!authStatus().ready) {
      return {
        response: Response.json(
          { error: "accounts_unavailable" },
          { status: 503, headers: noStore },
        ),
      };
    }
    const session = await getAuth()
      .api.getSession({ headers: request.headers })
      .catch(() => null);
    if (!session) {
      return {
        response: Response.json(
          { error: "sign_in_required" },
          { status: 401, headers: noStore },
        ),
      };
    }
    return { user: session.user };
  }

  async function guard(request: Request): Promise<Response | null> {
    const status = authStatus();
    if (!status.ready) {
      return Response.json(
        { error: "accounts_unavailable", reason: status.reason },
        { status: 503, headers: noStore },
      );
    }
    return rateLimitAuthRequest(request);
  }

  return {
    getAuth,
    authStatus,
    getSession,
    requireUser,
    GET: async (request: Request) =>
      (await guard(request)) ?? toNextJsHandler(getAuth()).GET(request),
    POST: async (request: Request) =>
      (await guard(request)) ?? toNextJsHandler(getAuth()).POST(request),
  };
}

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
  session: { id: string; expiresAt: Date };
}
