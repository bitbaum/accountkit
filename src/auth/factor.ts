import { createAuthMiddleware, getOAuthState } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";
import { deleteSessionCookie } from "better-auth/cookies";
import { returnPath } from "../paths.js";

/** Resolve only app-local challenge UI and return URLs; never carry bearer values. */
export function factorDestination(
  origin: string,
  screen: unknown,
  next: unknown,
): string {
  const local = (value: unknown, fallback: string) => {
    try {
      const url = new URL(typeof value === "string" ? value : fallback, origin);
      if (url.origin !== new URL(origin).origin)
        return new URL(fallback, origin);
      return new URL(
        returnPath(url.pathname + url.search + url.hash, fallback),
        origin,
      );
    } catch {
      return new URL(fallback, origin);
    }
  };
  const target = local(screen, "/sign-in");
  const destination = local(next, "/");
  for (const key of ["error", "error_description", "token", "code", "state"])
    target.searchParams.delete(key);
  target.searchParams.set("twoFactor", "1");
  target.searchParams.set(
    "next",
    destination.pathname === target.pathname
      ? "/"
      : destination.pathname + destination.search + destination.hash,
  );
  return target.toString();
}

/** Reuse BetterAuth's challenge/trusted-device policy for every primary method. */
export function factorForAllMethods(site: {
  title: string;
  url: string;
}): ReturnType<typeof twoFactor> {
  const plugin = twoFactor({ issuer: site.title, allowPasswordless: true });
  const native = plugin.hooks.after[0];
  return {
    ...plugin,
    hooks: {
      ...plugin.hooks,
      after: [
        ...plugin.hooks.after,
        {
          matcher: ({ path }) =>
            path === "/magic-link/verify" ||
            path === "/verify-email" ||
            path === "/passkey/verify-authentication" ||
            /^\/(?:oauth2\/)?callback\/[^/]+$/.test(path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const pending = ctx.context.newSession;
            if (
              !pending ||
              !("twoFactorEnabled" in pending.user) ||
              !pending.user.twoFactorEnabled
            )
              return;
            // Delegate cookie revocation, signed challenge creation, expiry,
            // attempt limits and trusted-device validation to the native plugin.
            let delegated: {
              headers: Headers;
              response:
                | { twoFactorRedirect: boolean; twoFactorMethods: string[] }
                | undefined;
            };
            try {
              // BetterCall's runtime supports returnHeaders even where the
              // middleware declaration exposes only its body. Validate it.
              const result: unknown = await native.handler({
                ...ctx,
                returnHeaders: true,
              });
              if (
                !result ||
                typeof result !== "object" ||
                !("headers" in result) ||
                !(result.headers instanceof Headers) ||
                !("response" in result)
              )
                throw new Error(
                  "Unsupported BetterAuth factor middleware envelope",
                );
              const body = result.response;
              if (
                body !== undefined &&
                (!body ||
                  typeof body !== "object" ||
                  !("twoFactorRedirect" in body) ||
                  body.twoFactorRedirect !== true ||
                  !("twoFactorMethods" in body) ||
                  !Array.isArray(body.twoFactorMethods) ||
                  !body.twoFactorMethods.every(
                    (method) => typeof method === "string",
                  ))
              )
                throw new Error("Unsupported BetterAuth factor challenge body");
              delegated = {
                headers: result.headers,
                response: body as
                  | { twoFactorRedirect: boolean; twoFactorMethods: string[] }
                  | undefined,
              };
            } catch (error) {
              // Never leave the primary session usable on an SDK failure.
              await ctx.context.internalAdapter.deleteSession(
                pending.session.token,
              );
              ctx.context.setNewSession(null);
              deleteSessionCookie(ctx, true);
              throw error;
            }
            // Middleware invocations return their own headers and body. Keep
            // each Set-Cookie separate, including session revocation + challenge.
            for (const [name, value] of delegated.headers) {
              if (name !== "set-cookie") ctx.responseHeaders.set(name, value);
            }
            for (const cookie of delegated.headers.getSetCookie())
              ctx.responseHeaders.append("set-cookie", cookie);
            if (
              ctx.context.newSession ||
              ctx.path === "/passkey/verify-authentication"
            )
              return delegated.response;
            const state = await getOAuthState();
            const target = factorDestination(
              site.url,
              ctx.query?.errorCallbackURL ?? state?.errorURL,
              ctx.query?.callbackURL ?? state?.callbackURL,
            );
            throw ctx.redirect(target);
          }),
        },
      ],
    },
  };
}
