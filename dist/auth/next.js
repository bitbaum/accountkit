import { headers } from "next/headers.js";
import { toNextJsHandler } from "better-auth/next-js";
import { asc, eq } from "drizzle-orm";
import { rateLimitAuthRequest } from "./limits.js";
import { authSchema } from "./schema.js";
import { authStatusFor, createAuthInstance, } from "./server.js";
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
export function createAuthRuntime(options) {
    let instance = null;
    const getAuth = () => {
        instance ??= createAuthInstance({
            site: options.site,
            mail: options.mail,
            schema: options.schema,
            onAccountCreated: options.onAccountCreated,
            database: options.getDatabase(),
        });
        return instance;
    };
    const authStatus = (env = process.env) => authStatusFor(options.isDatabaseConfigured(env), env);
    const noStore = { "Cache-Control": "no-store" };
    const actorIds = new Map();
    /** The id the product's own rows use for this person. */
    async function actorIdOf(user) {
        const provider = options.legacyIdentityProvider;
        if (!provider)
            return user.id;
        const known = actorIds.get(user.id);
        if (known)
            return known;
        const table = (options.schema?.account ??
            authSchema.account);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = options.getDatabase();
        // The person's FIRST sign-in method decides: if it was the provider, their
        // rows were written under its subject before this account existed.
        const rows = await db
            .select({ accountId: table.accountId, providerId: table.providerId })
            .from(table)
            .where(eq(table.userId, user.id))
            .orderBy(asc(table.createdAt))
            .limit(1);
        const id = rows[0]?.providerId === provider ? rows[0].accountId : user.id;
        actorIds.set(user.id, id);
        return id;
    }
    /** Who is signed in, for a server component. Null also when accounts are unavailable. */
    async function getSession() {
        if (!authStatus().ready)
            return null;
        try {
            return (await getAuth().api.getSession({
                headers: await headers(),
            }));
        }
        catch (error) {
            console.error(`[auth] session read failed: ${error.name}`);
            return null;
        }
    }
    /** The signed-in person behind an API request, or the Response to send instead. */
    async function requireUser(request) {
        if (!authStatus().ready) {
            return {
                response: Response.json({ error: "accounts_unavailable" }, { status: 503, headers: noStore }),
            };
        }
        const session = await getAuth()
            .api.getSession({ headers: request.headers })
            .catch(() => null);
        if (!session) {
            return {
                response: Response.json({ error: "sign_in_required" }, { status: 401, headers: noStore }),
            };
        }
        return {
            user: { ...session.user, actorId: await actorIdOf(session.user) },
        };
    }
    async function guard(request) {
        const status = authStatus();
        if (!status.ready) {
            return Response.json({ error: "accounts_unavailable", reason: status.reason }, { status: 503, headers: noStore });
        }
        return rateLimitAuthRequest(request);
    }
    return {
        getAuth,
        authStatus,
        getSession,
        requireUser,
        GET: async (request) => (await guard(request)) ?? toNextJsHandler(getAuth()).GET(request),
        POST: async (request) => (await guard(request)) ?? toNextJsHandler(getAuth()).POST(request),
    };
}
//# sourceMappingURL=next.js.map