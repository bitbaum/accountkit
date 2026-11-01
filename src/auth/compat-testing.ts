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

export function createCompatClient(options: {
  compat: CompatRoute;
  site: string;
}) {
  const jar = new Map<string, string>();
  let ip = 0;

  const cookieHeader = () =>
    [...jar].map(([name, value]) => `${name}=${value}`).join("; ");

  function keep(response: Response) {
    for (const set of response.headers.getSetCookie()) {
      const [pair] = set.split(";");
      const at = pair.indexOf("=");
      const name = pair.slice(0, at);
      const value = pair.slice(at + 1);
      if (/max-age=0/i.test(set) || value === "") jar.delete(name);
      else jar.set(name, value);
    }
    return response;
  }

  /** One request to /api/auth{route}: a form POST when `form` is given, else a GET. */
  async function call(
    route: string,
    form?: Record<string, string>,
  ): Promise<Response> {
    ip += 1;
    const headers = new Headers({
      origin: options.site,
      "x-forwarded-for": `198.51.100.${ip % 250}`,
      cookie: cookieHeader(),
    });
    if (form) headers.set("content-type", "application/x-www-form-urlencoded");
    const request = new Request(`${options.site}/api/auth${route}`, {
      method: form ? "POST" : "GET",
      headers,
      body: form ? new URLSearchParams(form) : undefined,
    });
    return keep(
      await (form
        ? options.compat.route.POST(request)
        : options.compat.route.GET(request)),
    );
  }

  return {
    call,
    /** The jar as a Cookie header, to hand to server-side helpers. */
    get cookie() {
      return cookieHeader();
    },
    /** Replace the jar (switch between people), from a Cookie header. */
    set cookie(value: string) {
      jar.clear();
      for (const part of value.split("; ").filter(Boolean)) {
        const at = part.indexOf("=");
        jar.set(part.slice(0, at), part.slice(at + 1));
      }
    },
    /** signIn(provider, { redirect: false }) as next-auth/react posts it. */
    async signIn(
      provider: string,
      fields: Record<string, string>,
      callbackUrl = `${options.site}/`,
    ) {
      const response = await call(`/callback/${provider}`, {
        ...fields,
        csrfToken: "test",
        callbackUrl,
      });
      return (await response.json()) as { url: string };
    },
    /** signOut({ redirect: false, callbackUrl }) as next-auth/react posts it. */
    async signOut(callbackUrl = `${options.site}/`) {
      const response = await call("/signout", {
        csrfToken: "test",
        callbackUrl,
      });
      return (await response.json()) as { url: string };
    },
    /** getSession(): the product session, or null. */
    async session<S = { user: Record<string, unknown> }>(): Promise<S | null> {
      return (await (await call("/session")).json()) as S | null;
    },
    /** useSession().update(): the same fresh read, posted. */
    async update<S = { user: Record<string, unknown> }>(): Promise<S | null> {
      return (await (
        await call("/session", { data: "{}" })
      ).json()) as S | null;
    },
    /** The `error` a sign-in answer carries for the login page, or null on success. */
    refusal(result: { url: string }): string | null {
      return new URL(result.url).searchParams.get("error");
    },
    /** The login page's `code` from a refused sign-in. */
    code(result: { url: string }): string | null {
      return new URL(result.url).searchParams.get("code");
    },
  };
}
