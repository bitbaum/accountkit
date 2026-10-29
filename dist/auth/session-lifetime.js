import { createAuthMiddleware, getSessionFromCtx, setShouldSkipSessionRefresh, } from "better-auth/api";
/** Extend an active session at most this often, as a sliding refresh does. */
const EXTEND_WINDOW_SECONDS = 60 * 60;
export function sessionLifetimePlugin(lifetime) {
    return {
        id: "accountkit-session-lifetime",
        hooks: {
            before: [
                {
                    matcher: () => true,
                    handler: createAuthMiddleware(async (ctx) => {
                        const current = await getSessionFromCtx(ctx, {
                            disableRefresh: true,
                        });
                        if (!current)
                            return;
                        const seconds = await lifetime(current.user.id);
                        if (!seconds)
                            return;
                        await setShouldSkipSessionRefresh(true);
                        const now = Date.now();
                        const adapter = ctx.context.internalAdapter;
                        const lastActive = new Date(current.session.updatedAt).getTime();
                        if (now - lastActive > seconds * 1000) {
                            // Idle past the limit: the session ends, whatever expiry it carries.
                            await adapter.deleteSession(current.session.token);
                            return;
                        }
                        const expiresAt = new Date(current.session.expiresAt).getTime();
                        const limit = now + seconds * 1000;
                        if (expiresAt > limit ||
                            limit - expiresAt >= EXTEND_WINDOW_SECONDS * 1000) {
                            await adapter.updateSession(current.session.token, {
                                expiresAt: new Date(limit),
                                updatedAt: new Date(now),
                            });
                        }
                    }),
                },
            ],
        },
    };
}
//# sourceMappingURL=session-lifetime.js.map