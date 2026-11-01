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
 */
/** The shared runtime, as `createAuthRuntime` returns it. */
export interface CompatRuntime {
    GET: (request: Request) => Promise<Response>;
    POST: (request: Request) => Promise<Response>;
    sessionFor: (headers: Headers) => Promise<AuthSession | null>;
    getSession: () => Promise<AuthSession | null>;
}
/** Why a sign-in was refused; the product maps each to the code its login page reads. */
export type RefusalReason = "missing" | "credentials" | "rate_limited" | "unavailable" | "email_unverified";
/** A credentials provider: what the form is called and which address it signs in. */
export interface CompatCredentialsProvider {
    /** The provider's display name in /providers. */
    name: string;
    /**
     * The address this form signs in, or a refusal code the login page reads
     * (an account lock, say), or null for "missing input". The password is read
     * by the compat layer from the form's `password` field.
     */
    resolve: (form: FormData) => Promise<{
        email: string;
    } | {
        refuse: string;
    } | null>;
}
export interface SignInEvent {
    provider: string;
    email: string;
    user: {
        id: string;
        name?: string | null;
    };
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
    linkWhenSignedIn?: (request: Request, session: S) => boolean | Promise<boolean>;
    /** Where a failed link returns (default: the page it started from). */
    linkErrorPath?: string;
    /** The env OIDC providers are read from (default: process.env). */
    env?: () => Record<string, string | undefined>;
}
/** One AccountKit endpoint's answer, for the compat layer to translate. */
export interface SharedAnswer {
    status: number;
    body: Record<string, unknown>;
    cookies: string[];
}
/**
 * AccountKit endpoints the screens reach directly; everything else answers 404.
 * `oidcProviders` are the OIDC providers whose callback (`/callback/<id>`)
 * comes back from the provider.
 */
export declare function compatPathIsOpen(path: string, oidcProviders?: ReadonlySet<string>): boolean;
/** A same-origin path from a client-supplied URL, or `fallback`. */
export declare function sameOriginPath(raw: FormDataEntryValue | string | null | undefined, site: string, fallback: string): string;
export declare function createNextAuthCompat<S>(options: NextAuthCompatOptions<S>): {
    handle: (request: Request) => Promise<Response | null>;
    /** /api/auth/* with the switch on: the compat answer, else the runtime. */
    route: {
        GET: (request: Request) => Promise<Response>;
        POST: (request: Request) => Promise<Response>;
    };
    callShared: (request: Request, route: string, body: Record<string, unknown>) => Promise<SharedAnswer>;
    sessionFor: (requestHeaders: Headers) => Promise<S | null>;
    sessionIdFor: (requestHeaders: Headers) => Promise<string | null>;
    currentSession: () => Promise<S | null>;
    oidcSignIn: (request: Request, providerId: string, next: string) => Promise<{
        url: string | null;
        cookies: string[];
    }>;
    providers: () => Record<string, {
        id: string;
        name: string;
        type: string;
        signinUrl: string;
        callbackUrl: string;
    }>;
};
export type NextAuthCompat<S> = ReturnType<typeof createNextAuthCompat<S>>;
//# sourceMappingURL=nextauth-compat.d.ts.map