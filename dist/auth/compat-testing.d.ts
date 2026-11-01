/**
 * A browser stand-in for journey tests of a product on the compat layer: it
 * speaks what `next-auth/react` sends, keeps the cookie jar between calls,
 * and gives each request its own client address so AccountKit's limiter
 * never trips inside one test file.
 *
 *   const client = createCompatClient({ compat, site: "https://app.example.test" });
 *   const result = await client.signIn("credentials", { email, password });
 *   expect(client.refusal(result)).toBeNull();
 *   expect((await client.session())?.user.id).toBe(id);
 */
/** What the client needs from `createNextAuthCompat(...)`. */
export interface CompatRoute {
    route: {
        GET: (request: Request) => Promise<Response>;
        POST: (request: Request) => Promise<Response>;
    };
}
export declare function createCompatClient(options: {
    compat: CompatRoute;
    site: string;
}): {
    call: (route: string, form?: Record<string, string>) => Promise<Response>;
    /** The jar as a Cookie header, to hand to server-side helpers. */
    cookie: string;
    /** signIn(provider, { redirect: false }) as next-auth/react posts it. */
    signIn(provider: string, fields: Record<string, string>, callbackUrl?: string): Promise<{
        url: string;
    }>;
    /** signOut({ redirect: false, callbackUrl }) as next-auth/react posts it. */
    signOut(callbackUrl?: string): Promise<{
        url: string;
    }>;
    /** getSession(): the product session, or null. */
    session<S = {
        user: Record<string, unknown>;
    }>(): Promise<S | null>;
    /** useSession().update(): the same fresh read, posted. */
    update<S = {
        user: Record<string, unknown>;
    }>(): Promise<S | null>;
    /** The `error` a sign-in answer carries for the login page, or null on success. */
    refusal(result: {
        url: string;
    }): string | null;
    /** The login page's `code` from a refused sign-in. */
    code(result: {
        url: string;
    }): string | null;
};
//# sourceMappingURL=compat-testing.d.ts.map