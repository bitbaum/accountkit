import { createHash } from "node:crypto";

/**
 * Which sign-in methods this deployment offers — a pure function of its env,
 * so "is this button shown" is a unit test, not a guess (fleet STACK.md,
 * "Identity", 2026-10-11).
 *
 *  - Email + password, passkeys and two-factor need nothing external.
 *  - A magic link needs mail (@bitbaum/mail-kit). Without it the option is
 *    HIDDEN in production rather than offered and silently undeliverable; in
 *    development the link is printed to the server console instead.
 *  - "bitbaum sign-in" is the shared sign-in service (Morulia) that holds the
 *    providers' credentials once and speaks OIDC to every app, issuing a
 *    per-app (pairwise) subject. Shown only when SIGNIN_* is set AND the
 *    service publishes at least one provider at <issuer>/api/providers; the
 *    button names exactly the providers it publishes, so an app never offers
 *    one that is not configured.
 *  - "Sign in with OrangeCat" is OrangeCat's OIDC provider: one click for
 *    people who already have OrangeCat, never a requirement. OrangeCat's token
 *    endpoint accepts ONLY client_secret_post and requires PKCE.
 *
 * A method whose env is missing is hidden, never broken.
 */
type Env = Record<string, string | undefined>;

export const SIGNIN_PROVIDER_ID = "bitbaum-signin";
export const ORANGECAT_PROVIDER_ID = "orangecat";
export const ORANGECAT_DEFAULT_ISSUER = "https://orangecat.ch";

export const GITHUB_PROVIDER_ID = "github";

export type OidcProviderId =
  typeof SIGNIN_PROVIDER_ID | typeof ORANGECAT_PROVIDER_ID;

export interface OidcClient {
  providerId: OidcProviderId;
  issuer: string;
  discoveryUrl: string;
  clientId: string;
  clientSecret: string;
}

const text = (value: string | undefined) => value?.trim() || "";

/**
 * An issuer we are willing to send people to: https, or http on localhost for
 * development. Anything else is treated as not configured — a typo must hide
 * the button, not send someone's sign-in over plain HTTP.
 */
export function usableIssuer(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local))
    return null;
  if (url.search || url.hash || url.username || url.password) return null;
  // OIDC compares `iss` byte for byte; normalise only the trailing slash used
  // to build the discovery URL, never the issuer itself.
  return value;
}

function oidcClient(
  providerId: OidcProviderId,
  issuerValue: string,
  clientId: string,
  clientSecret: string,
): OidcClient | null {
  if (!issuerValue || !clientId || !clientSecret) return null;
  const issuer = usableIssuer(issuerValue);
  if (!issuer) return null;
  return {
    providerId,
    issuer,
    discoveryUrl: `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`,
    clientId,
    clientSecret,
  };
}

/** The shared bitbaum sign-in service (SIGNIN_ISSUER/CLIENT_ID/CLIENT_SECRET). */
export function signinBroker(env: Env): OidcClient | null {
  return oidcClient(
    SIGNIN_PROVIDER_ID,
    text(env.SIGNIN_ISSUER),
    text(env.SIGNIN_CLIENT_ID),
    text(env.SIGNIN_CLIENT_SECRET),
  );
}

/** OrangeCat, under the env names every fleet app already uses. */
export function orangecatOidc(env: Env): OidcClient | null {
  return oidcClient(
    ORANGECAT_PROVIDER_ID,
    text(env.ORANGECAT_OAUTH_ISSUER) || ORANGECAT_DEFAULT_ISSUER,
    text(env.ORANGECAT_OAUTH_CLIENT_ID),
    text(env.ORANGECAT_OAUTH_CLIENT_SECRET),
  );
}

/**
 * A product's own registered GitHub OAuth app (GITHUB_CLIENT_ID and
 * GITHUB_CLIENT_SECRET), for a product that had one before AccountKit and
 * keeps its callback, <site>/api/auth/callback/github. It brings that
 * product's GitHub sign-in, and the repository grant it acts with, across
 * unchanged. A product without its own app reaches GitHub through the bitbaum
 * sign-in instead. Both variables, or nothing.
 *
 * Opt-in: the app signs people in only when the product asks for it
 * (`githubSignIn: true`). The same two variables often hold an app a product
 * acts on repositories with and never meant as a way in (Loki), so their
 * presence alone offers nothing.
 */
export function productGithubApp(
  env: Env,
  signIn: boolean | undefined,
): { clientId: string; clientSecret: string } | null {
  if (signIn !== true) return null;
  const clientId = text(env.GITHUB_CLIENT_ID);
  const clientSecret = text(env.GITHUB_CLIENT_SECRET);
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function oidcClients(env: Env): OidcClient[] {
  return [signinBroker(env), orangecatOidc(env)].filter(
    (c): c is OidcClient => c !== null,
  );
}

/** ACCOUNTKIT_LIGHTNING=1 (or true) turns Lightning login on for a deployment. */
export function lightningOn(env: Env): boolean {
  return /^(1|true|on|yes)$/i.test(text(env.ACCOUNTKIT_LIGHTNING));
}

export interface SignInMethods {
  /** Recovery needs a real sender; absent on older capability objects. */
  passwordReset?: boolean;
  password: boolean;
  passkey: boolean;
  twoFactor: boolean;
  magicLink: boolean;
  /**
   * Whether an email must be confirmed before a password account signs in.
   * False by default: people sign in at once and confirm later (see
   * EmailConfirmation). True only for a product that opts in, with mail.
   */
  verifyEmail: boolean;
  signin: boolean;
  /**
   * What the shared sign-in's button names, in order ("Google", "GitHub"):
   * the providers the service publishes. Empty when `signin` is false.
   * Optional so a capability object built before 0.24 still type-checks.
   */
  signinProviders?: string[];
  orangecat: boolean;
  /**
   * Lightning login (LNURL-auth, ./lightning): the person's own wallet signs
   * a one-time challenge. Free, no key, no third party. Opt-in per deployment
   * with ACCOUNTKIT_LIGHTNING=1 until it is on everywhere.
   */
  lightning?: boolean;
}

/**
 * When a password account must have confirmed its address.
 *
 *  - "after-sign-in" (the default for every product): sign-up signs the person
 *    in at once. With mail, a confirmation link is sent too; confirming is
 *    never a wall in front of using the product. A product that reserves some
 *    powers for confirmed addresses reads `user.emailVerified` itself.
 *  - "before-sign-in": a product that cannot let an unconfirmed address in
 *    opts into the wall. It applies only with mail, because without mail the
 *    link could never arrive.
 */
export type EmailConfirmation = "after-sign-in" | "before-sign-in";

export interface SignInMethodOptions {
  /** Pass the same value the server was created with. Default "after-sign-in". */
  emailConfirmation?: EmailConfirmation;
  /**
   * The shared sign-in's provider names, when the caller already has them
   * (tests, or a product that loaded them itself with `loadSigninProviders`).
   * Without it, the last list read from the service is used.
   */
  signinProviders?: readonly string[];
}

/**
 * The providers the shared sign-in publishes, read from the service itself
 * (<issuer>/api/providers) and kept per issuer for a minute. `signInMethods`
 * is synchronous and called while a page renders, so it reads this cache and
 * starts a refresh in the background when the entry is missing or old. Until
 * the first answer arrives the button is HIDDEN: a button that names a
 * provider the service has not switched on is worse than none. A failed read
 * keeps the last good list.
 */
const PROVIDERS_TTL_MS = 60_000;
const PROVIDERS_TIMEOUT_MS = 5_000;
interface ProviderEntry {
  names: string[] | null;
  /** When the last read STARTED, answered or not: one read a minute at most. */
  tried: number;
  pending: Promise<string[] | null> | null;
}
const providerCache = new Map<string, ProviderEntry>();

function providersUrl(issuer: string): string {
  return `${issuer.replace(/\/+$/, "")}/api/providers`;
}

/** The names in a /api/providers answer, or null when it is not one. */
export function parseSigninProviders(body: unknown): string[] | null {
  const list = (body as { providers?: unknown } | null)?.providers;
  if (!Array.isArray(list)) return null;
  const names: string[] = [];
  for (const item of list) {
    const label = (item as { label?: unknown } | null)?.label;
    if (typeof label !== "string" || !label.trim() || label.length > 40)
      return null;
    names.push(label.trim());
  }
  return names;
}

/**
 * Reads the shared sign-in's provider list now and remembers it. Resolves to
 * the names, or null when SIGNIN_* is not set or the service did not answer
 * with a list (the last good list is kept). Never throws.
 */
export async function loadSigninProviders(
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<string[] | null> {
  const broker = signinBroker(env);
  if (!broker) return null;
  const key = broker.issuer;
  const entry = providerCache.get(key) ?? {
    names: null,
    tried: 0,
    pending: null,
  };
  providerCache.set(key, entry);
  if (entry.pending) return entry.pending;
  entry.tried = Date.now();
  entry.pending = (async () => {
    try {
      const response = await fetchImpl(providersUrl(key), {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(PROVIDERS_TIMEOUT_MS),
      });
      const names = response.ok
        ? parseSigninProviders(await response.json())
        : null;
      if (names) entry.names = names;
      return names ?? entry.names;
    } catch {
      return entry.names;
    } finally {
      entry.pending = null;
    }
  })();
  return entry.pending;
}

/**
 * The last provider list read from the shared sign-in, or null when none has
 * been read yet. Starts a background refresh when it is older than a minute.
 */
export function knownSigninProviders(env: Env): string[] | null {
  const broker = signinBroker(env);
  if (!broker) return null;
  const entry = providerCache.get(broker.issuer);
  if (!entry || Date.now() - entry.tried > PROVIDERS_TTL_MS)
    void loadSigninProviders(env);
  return entry?.names ?? null;
}

/** Forgets every provider list read so far (tests). */
export function resetSigninProviders(): void {
  providerCache.clear();
}

/** What the sign-in and sign-up pages offer. Safe to send to the browser: booleans only. */
export function signInMethods(
  env: Env,
  mailConfigured: boolean,
  options: SignInMethodOptions = {},
): SignInMethods {
  const development = env.NODE_ENV === "development";
  const names =
    signinBroker(env) === null
      ? null
      : options.signinProviders
        ? [...options.signinProviders]
        : knownSigninProviders(env);
  return {
    passwordReset: mailConfigured,
    password: true,
    passkey: true,
    twoFactor: true,
    magicLink: mailConfigured || development,
    verifyEmail:
      mailConfigured && options.emailConfirmation === "before-sign-in",
    signin: (names?.length ?? 0) > 0,
    signinProviders: names ?? [],
    orangecat: orangecatOidc(env) !== null,
    lightning: lightningOn(env),
  };
}

/**
 * The address given to a person who signed in with a method that brought no
 * email, or whose email we do not trust as an identity.
 *
 * An address from a provider is CONTACT data, never an identity: linking by it
 * lets whoever controls an unverified address at the provider take over the
 * local account (fleet accountkit, `orangecatProfile`). So OIDC accounts never
 * carry the provider's address. `.invalid` is reserved (RFC 2606): it cannot
 * receive mail and cannot collide with a real address. Hashed so the
 * provider's subject is not readable from it.
 */
export function placeholderEmail(providerId: string, subject: string): string {
  const digest = createHash("sha256")
    .update(`${providerId}:${subject}`)
    .digest("hex")
    .slice(0, 32);
  return `${digest}@${providerId}.invalid`;
}

/** Whether mail can ever reach this address. */
export function isDeliverable(email: string | null | undefined): boolean {
  if (!email) return false;
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return domain.length > 0 && !domain.endsWith(".invalid");
}
