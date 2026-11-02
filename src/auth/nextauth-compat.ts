import * as React from "react";
import {
  GITHUB_PROVIDER_ID,
  oidcClients,
  productGithubApp,
} from "./methods.js";
import type { AuthSession } from "./next.js";

/**
 * A product's existing screens on the shared runtime, unchanged.
 *
 * Products that grew up on Auth.js call `next-auth/react` (signIn, signOut,
 * useSession, update) from every page. While they move to AccountKit one
 * reversible step at a time, this answers that client protocol from the
 * AccountKit runtime, so no page has to learn a second protocol and no Auth.js
 * credential writer runs beside the shared one.
 *
 *   const compat = createNextAuthCompat({ runtime: sharedAuth, siteUrl, ... });
 *   // /api/auth/[...nextauth]/route.ts, with the switch on:
 *   export const { GET, POST } = compat.route;
 *
 * Only what the screens use is open. AccountKit's own sign-up, reset and
 * password endpoints answer 404 until the product adopts AccountKit's screens:
 * a second credential writer would put hashes in the shared table that the
 * product's own table never sees, and rolling back would lose them.
 *
 * Once the product has adopted them (`SignInForm`, `SignUpForm`,
 * `AccountPanel`) and retired its own credential writers, `screens:
 * "accountkit"` opens every AccountKit endpoint, so magic links, passkeys,
 * two-factor and recovery work, while the pages that still call
 * `next-auth/react` (`useSession`, `signOut`) keep the product's session shape.
 */

/** The shared runtime, as `createAuthRuntime` returns it. */
export interface CompatRuntime {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
  sessionFor: (headers: Headers) => Promise<AuthSession | null>;
  getSession: () => Promise<AuthSession | null>;
  /**
   * Whether the product's own GitHub app signs people in
   * (`createAuthRuntime({ githubSignIn: true })`). Absent means no.
   */
  githubSignIn?: boolean;
}

/** Why a sign-in was refused; the product maps each to the code its login page reads. */
export type RefusalReason =
  | "missing"
  | "credentials"
  | "rate_limited"
  | "unavailable"
  | "email_unverified";

/** A credentials provider: what the form is called and which address it signs in. */
export interface CompatCredentialsProvider {
  /** The provider's display name in /providers. */
  name: string;
  /**
   * The address this form signs in, or a refusal code the login page reads
   * (an account lock, say), or null for "missing input". The password is read
   * by the compat layer from the form's `password` field.
   */
  resolve: (
    form: FormData,
  ) => Promise<{ email: string } | { refuse: string } | null>;
}

export interface SignInEvent {
  provider: string;
  email: string;
  user: { id: string; name?: string | null };
}

export interface RefusalEvent {
  provider: string;
  email: string;
  status: number;
  reason: RefusalReason;
}

export interface NextAuthCompatOptions<S> {
  runtime: CompatRuntime;
  /** The public origin, read at request time (redirects and AccountKit's origin check). */
  siteUrl: () => string;
  /** Where a refusal sends the person (the product's sign-in page). */
  signInPath: string;
  /** Where a sign-in lands when the page named no same-origin callbackUrl. */
  landing: string;
  /**
   * The product's session shape from a shared session, re-read from the
   * product's own rows on every request; null when the person no longer exists.
   */
  toSession: (shared: AuthSession) => Promise<S | null>;
  /** next-auth credentials provider id → how it signs in. */
  credentials: Record<string, CompatCredentialsProvider>;
  /** The code the login page reads for each refusal (default: the reason itself). */
  codes?: Partial<Record<RefusalReason, string>>;
  /** After a successful credentials sign-in: lockout reset, onboarding, logs. */
  onSignedIn?: (event: SignInEvent) => Promise<void>;
  /** After AccountKit refused a password: failed-attempt counters, logs. */
  onRefused?: (event: RefusalEvent) => Promise<void>;
  /**
   * Whether an OIDC sign-in by a person who is already signed in links the
   * identity to them ("Connect OrangeCat") instead of signing in. Default: yes.
   */
  linkWhenSignedIn?: (
    request: Request,
    session: S,
  ) => boolean | Promise<boolean>;
  /** Where a failed link returns (default: the page it started from). */
  linkErrorPath?: string;
  /** The env OIDC providers are read from (default: process.env). */
  env?: () => Record<string, string | undefined>;
  /**
   * Whose screens sign people in and write credentials. `"product"` (the
   * default) keeps AccountKit's sign-up, reset and password endpoints closed,
   * so the product's own writers stay the only ones. `"accountkit"` opens
   * every AccountKit endpoint: use it once the product renders AccountKit's
   * screens and its own credential writers are gone.
   */
  screens?: "product" | "accountkit";
}

/** One AccountKit endpoint's answer, for the compat layer to translate. */
export interface SharedAnswer {
  status: number;
  body: Record<string, unknown>;
  cookies: string[];
}

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
export function compatPathIsOpen(
  path: string,
  oidcProviders: ReadonlySet<string> = new Set(),
): boolean {
  if (OPEN_PATHS.has(path)) return true;
  const callback = /^\/callback\/([^/]+)$/.exec(path);
  return callback !== null && oidcProviders.has(callback[1]);
}

/** A same-origin path from a client-supplied URL, or `fallback`. */
export function sameOriginPath(
  raw: FormDataEntryValue | string | null | undefined,
  site: string,
  fallback: string,
): string {
  const origin = new URL(site).origin;
  const value = typeof raw === "string" ? raw : "";
  try {
    const url = new URL(value || fallback, origin);
    return url.origin === origin ? url.pathname + url.search : fallback;
  } catch {
    return fallback;
  }
}

/** A redirect whose headers can still take cookies (Response.redirect's cannot). */
function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

function withCookies(response: Response, setCookies: string[]): Response {
  for (const cookie of setCookies)
    response.headers.append("set-cookie", cookie);
  return response;
}

// React.cache dedupes per request on the server; outside a React server
// render (tests, scripts) it is absent and every call reads afresh.
const cache: <T extends (...args: never[]) => unknown>(fn: T) => T =
  (React as { cache?: <T>(fn: T) => T }).cache ?? ((fn) => fn);

export function createNextAuthCompat<S>(options: NextAuthCompatOptions<S>) {
  const { runtime } = options;
  const code = (reason: RefusalReason) => options.codes?.[reason] ?? reason;
  const env = () =>
    options.env?.() ?? (process.env as Record<string, string | undefined>);

  /** Run one AccountKit endpoint for this request, keeping its cookies and proxy hop. */
  async function callShared(
    request: Request,
    route: string,
    body: Record<string, unknown>,
  ): Promise<SharedAnswer> {
    const origin = new URL(options.siteUrl()).origin;
    const forwarded = new Headers(request.headers);
    forwarded.delete("content-length");
    forwarded.set("origin", origin);
    forwarded.set("content-type", "application/json");
    const response = await runtime.POST(
      new Request(`${origin}/api/auth${route}`, {
        method: "POST",
        headers: forwarded,
        body: JSON.stringify(body),
      }),
    );
    const text = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      // Nothing to translate.
    }
    return {
      status: response.status,
      body: parsed,
      cookies: response.headers.getSetCookie(),
    };
  }

  async function toSessionOrNull(
    shared: AuthSession | null,
  ): Promise<S | null> {
    return shared ? options.toSession(shared) : null;
  }

  /** The product session behind these request headers (proxy, route handlers). */
  async function sessionFor(requestHeaders: Headers): Promise<S | null> {
    return toSessionOrNull(
      await runtime.sessionFor(requestHeaders).catch(() => null),
    );
  }

  /** The shared session id behind these headers, for "keep this session" writes. */
  async function sessionIdFor(requestHeaders: Headers): Promise<string | null> {
    const shared = await runtime.sessionFor(requestHeaders).catch(() => null);
    return shared?.session.id ?? null;
  }

  /** The product session of this request (server components, actions). */
  const currentSession = cache(async (): Promise<S | null> =>
    toSessionOrNull(await runtime.getSession()),
  );

  /** What next-auth/react reads on a refusal: `error` and the login page's `code`. */
  const refusal = (loginCode: string) =>
    Response.json({
      url: `${options.siteUrl()}${options.signInPath}?error=CredentialsSignin&code=${encodeURIComponent(loginCode)}`,
    });

  /** The methods the pages may use: the product's credentials, plus each configured OIDC client. */
  function providers() {
    const site = options.siteUrl();
    const entry = (id: string, name: string, type: string) => ({
      id,
      name,
      type,
      signinUrl: `${site}/api/auth/signin/${id}`,
      callbackUrl: `${site}/api/auth/callback/${id}`,
    });
    const list: Record<string, ReturnType<typeof entry>> = {};
    for (const client of oidcClients(env())) {
      list[client.providerId] = entry(
        client.providerId,
        client.providerId === "orangecat" ? "OrangeCat" : "bitbaum",
        "oidc",
      );
    }
    if (productGithubApp(env(), options.runtime.githubSignIn)) {
      list[GITHUB_PROVIDER_ID] = entry(GITHUB_PROVIDER_ID, "GitHub", "oauth");
    }
    for (const [id, provider] of Object.entries(options.credentials)) {
      list[id] = entry(id, provider.name, "credentials");
    }
    return list;
  }

  function oidcProviderIds(): Set<string> {
    const ids = oidcClients(env()).map((client) => client.providerId as string);
    if (productGithubApp(env(), options.runtime.githubSignIn))
      ids.push(GITHUB_PROVIDER_ID);
    return new Set(ids);
  }

  /**
   * Start an OIDC round-trip: a sign-in, or — for a person already signed in
   * whom the product lets link — linking the identity to them.
   */
  async function oidcSignIn(
    request: Request,
    providerId: string,
    next: string,
  ): Promise<{ url: string | null; cookies: string[] }> {
    const site = options.siteUrl();
    const signedIn = await sessionFor(request.headers);
    const link = signedIn
      ? await (options.linkWhenSignedIn?.(request, signedIn) ?? true)
      : false;
    // better-auth 1.7 serves generic OIDC providers through its core social
    // endpoints; the callback is /callback/<id>.
    const answer = await callShared(
      request,
      link ? "/link-social" : "/sign-in/social",
      {
        provider: providerId,
        callbackURL: `${site}${next}`,
        errorCallbackURL: link
          ? `${site}${options.linkErrorPath ?? next}`
          : `${site}${options.signInPath}?error=OAuthSignin`,
      },
    );
    return {
      url: typeof answer.body.url === "string" ? answer.body.url : null,
      cookies: answer.cookies,
    };
  }

  /** A hook's failure is logged and never costs the person their sign-in. */
  async function runHook(
    name: string,
    hook: (() => Promise<void>) | undefined,
  ) {
    try {
      await hook?.();
    } catch (error) {
      console.error(
        `[auth] compat ${name} hook failed: ${(error as Error).name}`,
      );
    }
  }

  async function credentialSignIn(
    request: Request,
    provider: string,
    form: FormData | null,
  ) {
    let resolved: Awaited<ReturnType<CompatCredentialsProvider["resolve"]>>;
    let answer: SharedAnswer;
    const password = String(form?.get("password") ?? "");
    try {
      resolved = await options.credentials[provider].resolve(
        form ?? new FormData(),
      );
      if (resolved && "refuse" in resolved) return refusal(resolved.refuse);
      if (!resolved || !resolved.email || !password)
        return refusal(code("missing"));
      answer = await callShared(request, "/sign-in/email", {
        email: resolved.email.trim().toLowerCase(),
        password,
      });
    } catch (error) {
      // The product's database or the runtime is down: say so, never a 500.
      console.error(
        `[auth] compat sign-in unavailable: ${(error as Error).name}`,
      );
      return refusal(code("unavailable"));
    }
    const email = resolved.email.trim().toLowerCase();
    if (answer.status === 200) {
      const user = answer.body.user as
        { id?: string; name?: string | null } | undefined;
      if (user?.id) {
        const signedIn = {
          provider,
          email,
          user: { id: user.id, name: user.name },
        };
        await runHook(
          "onSignedIn",
          options.onSignedIn && (() => options.onSignedIn!(signedIn)),
        );
      }
      const next = sameOriginPath(
        form?.get("callbackUrl"),
        options.siteUrl(),
        options.landing,
      );
      return withCookies(
        Response.json({ url: `${options.siteUrl()}${next}` }),
        answer.cookies,
      );
    }
    const reason: RefusalReason =
      answer.body.code === "EMAIL_NOT_VERIFIED"
        ? "email_unverified"
        : answer.status === 429
          ? "rate_limited"
          : answer.status >= 500
            ? "unavailable"
            : "credentials";
    const refused = { provider, email, status: answer.status, reason };
    await runHook(
      "onRefused",
      options.onRefused && (() => options.onRefused!(refused)),
    );
    return refusal(code(reason));
  }

  /**
   * Auth.js's client protocol, answered by the shared runtime. Null for an
   * AccountKit path the screens use, which then goes to the runtime itself.
   */
  async function handle(request: Request): Promise<Response | null> {
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
      const next = sameOriginPath(
        form?.get("callbackUrl"),
        site,
        options.signInPath,
      );
      return withCookies(
        Response.json({ url: `${site}${next}` }),
        answer.cookies,
      );
    }
    const credentials = /^\/callback\/([^/]+)$/.exec(path);
    if (
      method === "POST" &&
      credentials &&
      credentials[1] in options.credentials
    ) {
      return credentialSignIn(
        request,
        credentials[1],
        await request.formData().catch(() => null),
      );
    }
    const signin = /^\/signin\/([^/]+)$/.exec(path);
    if (signin && oidcProviderIds().has(signin[1])) {
      if (method === "POST") {
        const form = await request.formData().catch(() => null);
        const next = sameOriginPath(
          form?.get("callbackUrl"),
          site,
          options.landing,
        );
        const started = await oidcSignIn(request, signin[1], next);
        if (!started.url) return refusal(code("unavailable"));
        return withCookies(
          Response.json({ url: started.url }),
          started.cookies,
        );
      }
      if (method === "GET") {
        // A server-side signIn arrives here by redirect. Only a navigation the
        // product itself started may begin a round-trip that can link.
        const fetchSite = request.headers.get("sec-fetch-site");
        if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
          return redirectTo(`${site}${options.signInPath}`);
        }
        const next = sameOriginPath(
          url.searchParams.get("callbackUrl"),
          site,
          options.landing,
        );
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
    if (options.screens === "accountkit") return null;
    if (compatPathIsOpen(path, oidcProviderIds())) return null;
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  return {
    handle,
    /** /api/auth/* with the switch on: the compat answer, else the runtime. */
    route: {
      GET: async (request: Request) =>
        (await handle(request)) ?? runtime.GET(request),
      POST: async (request: Request) =>
        (await handle(request)) ?? runtime.POST(request),
    },
    callShared,
    sessionFor,
    sessionIdFor,
    currentSession,
    oidcSignIn,
    providers,
  };
}

export type NextAuthCompat<S> = ReturnType<typeof createNextAuthCompat<S>>;
