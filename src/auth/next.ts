import { headers } from "next/headers.js";
import { toNextJsHandler } from "better-auth/next-js";
import { asc, eq } from "drizzle-orm";
import { rateLimitAuthRequest } from "./limits.js";
import { authSchema } from "./schema.js";
import {
  authStatusFor,
  createAuthInstance,
  type Auth,
  type CreateAuthOptions,
  type AuthSite,
  type AuthMailer,
  type AuthStatus,
} from "./server.js";

export interface AuthRuntimeOptions {
  site: AuthSite;
  mail: AuthMailer;
  /** Map an existing deployment's secret/config names without mutating process.env. */
  env?: NodeJS.ProcessEnv;
  /** Whether the product has a database to keep accounts in. */
  isDatabaseConfigured: (env: NodeJS.ProcessEnv) => boolean;
  /** The Drizzle database. Called on first use, never at import. */
  getDatabase: () => unknown;
  /** Only if the product keeps the account tables under its own definitions. */
  schema?: Record<string, unknown>;
  /** See CreateAuthOptions.legacyBcrypt; only needed for imported credentials. */
  legacyBcrypt?: CreateAuthOptions["legacyBcrypt"];
  domainCredentials?: CreateAuthOptions["domainCredentials"];
  /** See CreateAuthOptions.provisioning: first passwords and identity linking. */
  provisioning?: CreateAuthOptions["provisioning"];
  /** See CreateAuthOptions.sessionLifetime: a shorter idle limit for some people. */
  sessionLifetime?: CreateAuthOptions["sessionLifetime"];
  /**
   * For a product whose rows were keyed on an OIDC subject before it had
   * accounts (an OrangeCat actor id). A person who FIRST came in through that
   * provider keeps the subject as their `actorId`, so every existing row stays
   * theirs with no data migration. Everyone else's `actorId` is their user id.
   * Linking the provider later never changes an id that already has data.
   */
  legacyIdentityProvider?: string;
  /** See CreateAuthOptions.onAccountCreated. */
  onAccountCreated?: CreateAuthOptions["onAccountCreated"];
}

type SessionUser = { id: string; actorId: string; role?: unknown };

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
      legacyBcrypt: options.legacyBcrypt,
      domainCredentials: options.domainCredentials,
      provisioning: options.provisioning,
      sessionLifetime: options.sessionLifetime,
      env: options.env,
      onAccountCreated: options.onAccountCreated,
      database: options.getDatabase(),
    });
    return instance;
  };
  const authStatus = (
    env: NodeJS.ProcessEnv = options.env ?? process.env,
  ): AuthStatus => authStatusFor(options.isDatabaseConfigured(env), env);
  const noStore = { "Cache-Control": "no-store" };
  const actorIds = new Map<string, string>();

  /** The id the product's own rows use for this person. */
  async function actorIdOf(user: {
    id: string;
    createdAt?: Date | string;
  }): Promise<string> {
    const provider = options.legacyIdentityProvider;
    if (!provider) return user.id;
    const known = actorIds.get(user.id);
    if (known) return known;
    const table = (options.schema?.account ??
      authSchema.account) as typeof authSchema.account;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = options.getDatabase() as any;
    // The person's FIRST sign-in method decides: if it was the provider, their
    // rows were written under its subject before this account existed.
    const rows: { accountId: string; providerId: string }[] = await db
      .select({ accountId: table.accountId, providerId: table.providerId })
      .from(table)
      .where(eq(table.userId, user.id))
      .orderBy(asc(table.createdAt))
      .limit(1);
    const id = rows[0]?.providerId === provider ? rows[0].accountId : user.id;
    actorIds.set(user.id, id);
    return id;
  }

  /**
   * The session behind these request headers, with the `actorId` the
   * product's rows use — or null. The one reader both `getSession` and
   * `requireUser` go through, so the two cannot disagree about who somebody
   * is.
   *
   * `actorId` is computed HERE and not left to the caller: `getSession` used
   * to return better-auth's raw session, whose user has no `actorId`, while
   * `requireUser` attached one. A product reading `session.user.actorId` in
   * a server component got `undefined` for every signed-in person and drew
   * the signed-out page, while its API routes, going through `requireUser`,
   * worked — which is how the fault stayed invisible.
   */
  async function sessionFor(
    requestHeaders: Headers,
  ): Promise<AuthSession | null> {
    if (!authStatus().ready) return null;
    const session = (await getAuth().api.getSession({
      headers: requestHeaders,
    })) as AuthSession | null;
    if (!session) return null;
    return {
      ...session,
      user: { ...session.user, actorId: await actorIdOf(session.user) },
    };
  }

  /** Who is signed in, for a server component. Null also when accounts are unavailable. */
  async function getSession(): Promise<AuthSession | null> {
    // Always cross the request boundary, even when a build has no database or
    // secret. Otherwise Next can pre-render an anonymous redirect permanently.
    // Keep this outside the catch: framework dynamic-render signals must escape.
    const requestHeaders = await headers();
    if (!authStatus().ready) return null;
    try {
      return await sessionFor(requestHeaders);
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
    const session = await sessionFor(request.headers).catch(() => null);
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
    sessionFor,
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
    /** The id the product's rows use: the user id, or a legacy subject (see legacyIdentityProvider). */
    actorId: string;
    createdAt?: Date | string;
    name: string;
    email: string;
    emailVerified: boolean;
    image?: string | null;
    role?: string;
    twoFactorEnabled?: boolean;
  };
  session: { id: string; expiresAt: Date };
}
