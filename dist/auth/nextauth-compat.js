import * as React from "react";
import { GITHUB_PROVIDER_ID, oidcClients, productGithubApp, } from "./methods.js";
const OPEN_PATHS = new Set([
    "/get-session",
    "/sign-in/email",
    "/sign-out",
    "/ok",
    "/error",
]);
/**
 * AccountKit endpoints the screens reach directly; everything else answers 404.
 * `oidcProviders` are the OIDC providers whose callback (`/callback/<id>`)
 * comes back from the provider.
 */
export function compatPathIsOpen(path, oidcProviders = new Set()) {
    if (OPEN_PATHS.has(path))
        return true;
    const callback = /^\/callback\/([^/]+)$/.exec(path);
    return callback !== null && oidcProviders.has(callback[1]);
}
/** A same-origin path from a client-supplied URL, or `fallback`. */
export function sameOriginPath(raw, site, fallback) {
    const origin = new URL(site).origin;
    const value = typeof raw === "string" ? raw : "";
    try {
        const url = new URL(value || fallback, origin);
        return url.origin === origin ? url.pathname + url.search : fallback;
    }
    catch {
        return fallback;
    }
}
/** A redirect whose headers can still take cookies (Response.redirect's cannot). */
function redirectTo(location) {
    return new Response(null, { status: 302, headers: { location } });
}
function withCookies(response, setCookies) {
    for (const cookie of setCookies)
        response.headers.append("set-cookie", cookie);
    return response;
}
// React.cache dedupes per request on the server; outside a React server
// render (tests, scripts) it is absent and every call reads afresh.
const cache = React.cache ?? ((fn) => fn);
export function createNextAuthCompat(options) {
    const { runtime } = options;
    const code = (reason) => options.codes?.[reason] ?? reason;
    const env = () => options.env?.() ?? process.env;
    /** Run one AccountKit endpoint for this request, keeping its cookies and proxy hop. */
    async function callShared(request, route, body) {
        const origin = new URL(options.siteUrl()).origin;
        const forwarded = new Headers(request.headers);
        forwarded.delete("content-length");
        forwarded.set("origin", origin);
        forwarded.set("content-type", "application/json");
        const response = await runtime.POST(new Request(`${origin}/api/auth${route}`, {
            method: "POST",
            headers: forwarded,
            body: JSON.stringify(body),
        }));
        const text = await response.text();
        let parsed = {};
        try {
            parsed = text ? JSON.parse(text) : {};
        }
        catch {
            // Nothing to translate.
        }
        return {
            status: response.status,
            body: parsed,
            cookies: response.headers.getSetCookie(),
        };
    }
    async function toSessionOrNull(shared) {
        return shared ? options.toSession(shared) : null;
    }
    /** The product session behind these request headers (proxy, route handlers). */
    async function sessionFor(requestHeaders) {
        return toSessionOrNull(await runtime.sessionFor(requestHeaders).catch(() => null));
    }
    /** The shared session id behind these headers, for "keep this session" writes. */
    async function sessionIdFor(requestHeaders) {
        const shared = await runtime.sessionFor(requestHeaders).catch(() => null);
        return shared?.session.id ?? null;
    }
    /** The product session of this request (server components, actions). */
    const currentSession = cache(async () => toSessionOrNull(await runtime.getSession()));
    /** What next-auth/react reads on a refusal: `error` and the login page's `code`. */
    const refusal = (loginCode) => Response.json({
        url: `${options.siteUrl()}${options.signInPath}?error=CredentialsSignin&code=${encodeURIComponent(loginCode)}`,
    });
    /** The methods the pages may use: the product's credentials, plus each configured OIDC client. */
    function providers() {
        const site = options.siteUrl();
        const entry = (id, name, type) => ({
            id,
            name,
            type,
            signinUrl: `${site}/api/auth/signin/${id}`,
            callbackUrl: `${site}/api/auth/callback/${id}`,
        });
        const list = {};
        for (const client of oidcClients(env())) {
            list[client.providerId] = entry(client.providerId, client.providerId === "orangecat" ? "OrangeCat" : "bitbaum", "oidc");
        }
        if (productGithubApp(env(), options.runtime.githubSignIn)) {
            list[GITHUB_PROVIDER_ID] = entry(GITHUB_PROVIDER_ID, "GitHub", "oauth");
        }
        for (const [id, provider] of Object.entries(options.credentials)) {
            list[id] = entry(id, provider.name, "credentials");
        }
        return list;
    }
    function oidcProviderIds() {
        const ids = oidcClients(env()).map((client) => client.providerId);
        if (productGithubApp(env(), options.runtime.githubSignIn))
            ids.push(GITHUB_PROVIDER_ID);
        return new Set(ids);
    }
    /**
     * Start an OIDC round-trip: a sign-in, or — for a person already signed in
     * whom the product lets link — linking the identity to them.
     */
    async function oidcSignIn(request, providerId, next) {
        const site = options.siteUrl();
        const signedIn = await sessionFor(request.headers);
        const link = signedIn
            ? await (options.linkWhenSignedIn?.(request, signedIn) ?? true)
            : false;
        // better-auth 1.7 serves generic OIDC providers through its core social
        // endpoints; the callback is /callback/<id>.
        const answer = await callShared(request, link ? "/link-social" : "/sign-in/social", {
            provider: providerId,
            callbackURL: `${site}${next}`,
            errorCallbackURL: link
                ? `${site}${options.linkErrorPath ?? next}`
                : `${site}${options.signInPath}?error=OAuthSignin`,
        });
        return {
            url: typeof answer.body.url === "string" ? answer.body.url : null,
            cookies: answer.cookies,
        };
    }
    /** A hook's failure is logged and never costs the person their sign-in. */
    async function runHook(name, hook) {
        try {
            await hook?.();
        }
        catch (error) {
            console.error(`[auth] compat ${name} hook failed: ${error.name}`);
        }
    }
    async function credentialSignIn(request, provider, form) {
        let resolved;
        let answer;
        const password = String(form?.get("password") ?? "");
        try {
            resolved = await options.credentials[provider].resolve(form ?? new FormData());
            if (resolved && "refuse" in resolved)
                return refusal(resolved.refuse);
            if (!resolved || !resolved.email || !password)
                return refusal(code("missing"));
            answer = await callShared(request, "/sign-in/email", {
                email: resolved.email.trim().toLowerCase(),
                password,
            });
        }
        catch (error) {
            // The product's database or the runtime is down: say so, never a 500.
            console.error(`[auth] compat sign-in unavailable: ${error.name}`);
            return refusal(code("unavailable"));
        }
        const email = resolved.email.trim().toLowerCase();
        if (answer.status === 200) {
            const user = answer.body.user;
            if (user?.id) {
                const signedIn = {
                    provider,
                    email,
                    user: { id: user.id, name: user.name },
                };
                await runHook("onSignedIn", options.onSignedIn && (() => options.onSignedIn(signedIn)));
            }
            const next = sameOriginPath(form?.get("callbackUrl"), options.siteUrl(), options.landing);
            return withCookies(Response.json({ url: `${options.siteUrl()}${next}` }), answer.cookies);
        }
        const reason = answer.body.code === "EMAIL_NOT_VERIFIED"
            ? "email_unverified"
            : answer.status === 429
                ? "rate_limited"
                : answer.status >= 500
                    ? "unavailable"
                    : "credentials";
        const refused = { provider, email, status: answer.status, reason };
        await runHook("onRefused", options.onRefused && (() => options.onRefused(refused)));
        return refusal(code(reason));
    }
    /**
     * Auth.js's client protocol, answered by the shared runtime. Null for an
     * AccountKit path the screens use, which then goes to the runtime itself.
     */
    async function handle(request) {
        const url = new URL(request.url);
        const path = url.pathname.replace(/^\/api\/auth/, "");
        const site = options.siteUrl();
        const { method } = request;
        // GET reads the session; POST is useSession().update(), which carries
        // nothing: the session is re-read from the product's rows every request.
        if (path === "/session" && (method === "GET" || method === "POST")) {
            return Response.json(await sessionFor(request.headers), {
                headers: { "Cache-Control": "no-store" },
            });
        }
        if (method === "GET" && path === "/csrf") {
            // AccountKit checks the request origin itself; the client needs a value.
            return Response.json({ csrfToken: "accountkit" });
        }
        if (method === "GET" && path === "/providers")
            return Response.json(providers());
        if (method === "POST" && path === "/signout") {
            const form = await request.formData().catch(() => null);
            const answer = await callShared(request, "/sign-out", {});
            const next = sameOriginPath(form?.get("callbackUrl"), site, options.signInPath);
            return withCookies(Response.json({ url: `${site}${next}` }), answer.cookies);
        }
        const credentials = /^\/callback\/([^/]+)$/.exec(path);
        if (method === "POST" &&
            credentials &&
            credentials[1] in options.credentials) {
            return credentialSignIn(request, credentials[1], await request.formData().catch(() => null));
        }
        const signin = /^\/signin\/([^/]+)$/.exec(path);
        if (signin && oidcProviderIds().has(signin[1])) {
            if (method === "POST") {
                const form = await request.formData().catch(() => null);
                const next = sameOriginPath(form?.get("callbackUrl"), site, options.landing);
                const started = await oidcSignIn(request, signin[1], next);
                if (!started.url)
                    return refusal(code("unavailable"));
                return withCookies(Response.json({ url: started.url }), started.cookies);
            }
            if (method === "GET") {
                // A server-side signIn arrives here by redirect. Only a navigation the
                // product itself started may begin a round-trip that can link.
                const fetchSite = request.headers.get("sec-fetch-site");
                if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
                    return redirectTo(`${site}${options.signInPath}`);
                }
                const next = sameOriginPath(url.searchParams.get("callbackUrl"), site, options.landing);
                const started = await oidcSignIn(request, signin[1], next);
                if (!started.url)
                    return redirectTo(`${site}${options.signInPath}?error=OAuthSignin`);
                return withCookies(redirectTo(started.url), started.cookies);
            }
        }
        if (method === "GET" && (path === "/signin" || signin)) {
            // next-auth/react sends a provider this runtime does not offer here.
            return redirectTo(`${site}${options.signInPath}?error=OAuthSignin`);
        }
        if (options.screens === "accountkit")
            return null;
        if (compatPathIsOpen(path, oidcProviderIds()))
            return null;
        return Response.json({ error: "not_found" }, { status: 404 });
    }
    return {
        handle,
        /** /api/auth/* with the switch on: the compat answer, else the runtime. */
        route: {
            GET: async (request) => (await handle(request)) ?? runtime.GET(request),
            POST: async (request) => (await handle(request)) ?? runtime.POST(request),
        },
        callShared,
        sessionFor,
        sessionIdFor,
        currentSession,
        oidcSignIn,
        providers,
    };
}
//# sourceMappingURL=nextauth-compat.js.map