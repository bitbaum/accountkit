/**
 * A product-chosen idle limit for some people's sessions (for example, staff
 * on 8 hours where everyone else keeps the shared default).
 *
 * better-auth has one lifetime for every session and refreshes a session to
 * that lifetime whenever it is due, so a shorter expiry written from outside
 * is undone on the next request. This takes the refresh over for the people
 * the product names: a session idle longer than their limit is deleted, an
 * active one is extended to now + limit at most once per window, and the
 * global refresh never runs for it.
 */
export type SessionLifetime = (userId: string) => Promise<number | null | undefined>;
export declare function sessionLifetimePlugin(lifetime: SessionLifetime): {
    id: string;
    hooks: {
        before: {
            matcher: () => boolean;
            handler: import("better-auth").Middleware<import("better-auth").MiddlewareOptions, (inputContext: import("better-auth").MiddlewareInputContext<import("better-auth").MiddlewareOptions>) => Promise<void>>;
        }[];
    };
};
//# sourceMappingURL=session-lifetime.d.ts.map