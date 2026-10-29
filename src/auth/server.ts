import { passkey } from "@better-auth/passkey";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth, magicLink } from "better-auth/plugins";
import type { GenericOAuthConfig } from "better-auth/plugins";
import {
  oidcClients,
  placeholderEmail,
  signInMethods,
  type OidcClient,
} from "./methods.js";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./password.js";
import { DEFAULT_ROLE } from "./roles.js";
import { authSchema } from "./schema.js";
import { factorForAllMethods } from "./factor.js";
import { createPasswordHasher, type BcryptLike } from "./hash.js";
import {
  domainCredentialsPlugin,
  type DomainCredentials,
} from "./domain-credentials.js";
import {
  provisioningPlugin,
  type AccountProvisioning,
} from "./provisioning.js";
import {
  sessionLifetimePlugin,
  type SessionLifetime,
} from "./session-lifetime.js";
import {
  recordResetAddress,
  recoveryVerificationPlugin,
} from "./recovery-verification.js";

/**
 * Accounts for a bitbaum product: better-auth 1.x on Drizzle + pg, configured
 * the same way everywhere (fleet STACK.md, "Identity"). A product passes in
 * what is its own — its address, its database, its mail — and gets the same
 * methods, limits, cookie rules and account-linking rules as every other.
 */
const MIN_SECRET_LENGTH = 32;
const DEV_SECRET = "development-only-secret-never-used-in-production-0000";

export type { DomainCredentials } from "./domain-credentials.js";
export type { SessionLifetime } from "./session-lifetime.js";
export type {
  AccountProvisioning,
  ProvisionedIdentity,
} from "./provisioning.js";

export type AuthMailKind = "verify" | "magicLink" | "reset";

export interface AuthMailer {
  /** Whether mail can be sent at all. Without it the methods that need mail are hidden. */
  configured: boolean;
  /** Send an account mail. Must not throw, and must not log the link. */
  send(kind: AuthMailKind, to: string, url: string): Promise<void>;
}

export interface AuthSite {
  /** The public origin, e.g. https://causius.orangecat.ch. Pinned, never inferred. */
  url: string;
  /** Shown in authenticator apps and passkey prompts. */
  title: string;
  /** Cookie prefix. */
  slug: string;
  /**
   * Further public origins that serve the same product (a tenant host beside
   * the platform host). Requests from them pass the origin check; each host
   * keeps its own host-only cookie. Links in mail and passkeys use `url`.
   * A lookup (for hosts kept as data) is asked on each checked request.
   */
  trustedOrigins?: string[] | (() => Promise<string[]>);
}

export interface CreateAuthOptions {
  site: AuthSite;
  /** A Drizzle node-postgres or pglite database holding the tables in ./schema. */
  database: unknown;
  /** Defaults to this package's tables; pass your own only if you must. */
  schema?: Record<string, unknown>;
  /**
   * Read existing bcrypt and AccountKit $bs1$ credentials during migration.
   * New and reset passwords use the runtime's native scrypt format. Products
   * retain their existing user ids and copy hashes without decrypting them.
   */
  legacyBcrypt?: BcryptLike;
  /** Optional domain proof (for example an existing housing login code). */
  domainCredentials?: DomainCredentials;
  /**
   * First password for an identity the product created without one (an
   * invitation, a login code), and linking a second identity to an existing
   * account on that account's own password. See ./provisioning.
   */
  provisioning?: AccountProvisioning;
  /**
   * Seconds of inactivity after which this person's sessions end, or nothing
   * for the shared default (14 days). See ./session-lifetime.
   */
  sessionLifetime?: SessionLifetime;
  /**
   * The product's own better-auth plugins for its domain (for example
   * `organization()` for workspaces). Mounted after AccountKit's own, so they
   * add endpoints and tables; they do not replace the shared sign-in methods.
   * Their tables must be in `schema`.
   */
  plugins?: BetterAuthPlugin[];
  mail: AuthMailer;
  env?: NodeJS.ProcessEnv;
  /**
   * Called as a sign-in method is attached to a person (a first sign-up
   * included), once the person exists. A product that used to identify people by another id — an
   * OrangeCat actor id, say — re-keys its own rows here. Must be idempotent;
   * a throw is logged and never blocks the sign-in.
   */
  onAccountCreated?: (account: {
    userId: string;
    providerId: string;
    accountId: string;
  }) => Promise<void>;
}

export type AuthStatus =
  { ready: true } | { ready: false; reason: "no_database" | "no_secret" };

/**
 * The session secret: BETTER_AUTH_SECRET, or the AUTH_SECRET a product moving
 * off next-auth already has on its server (better-auth reads the same pair).
 * Either way it must be 32+ characters in production.
 */
export function secretFrom(env: NodeJS.ProcessEnv): string {
  return (env.BETTER_AUTH_SECRET?.trim() || env.AUTH_SECRET?.trim()) ?? "";
}

export function authStatusFor(
  databaseConfigured: boolean,
  env: NodeJS.ProcessEnv = process.env,
): AuthStatus {
  if (!databaseConfigured) return { ready: false, reason: "no_database" };
  const secret = secretFrom(env);
  if (env.NODE_ENV === "production" && secret.length < MIN_SECRET_LENGTH) {
    return { ready: false, reason: "no_secret" };
  }
  return { ready: true };
}

function authSecret(env: NodeJS.ProcessEnv): string {
  const secret = secretFrom(env);
  if (secret.length >= MIN_SECRET_LENGTH) return secret;
  if (env.NODE_ENV === "production") {
    throw new Error(
      "BETTER_AUTH_SECRET is missing or shorter than 32 characters",
    );
  }
  return DEV_SECRET;
}

/** An OIDC client as better-auth's generic OAuth provider. */
export function oidcProvider(client: OidcClient): GenericOAuthConfig {
  return {
    providerId: client.providerId,
    discoveryUrl: client.discoveryUrl,
    // Identity comes from a VERIFIED id_token (issuer + JWKS from discovery);
    // a discovery that cannot provide them skips the provider instead of
    // silently decoding an unverified token.
    requireIdTokenVerification: true,
    clientId: client.clientId,
    clientSecret: client.clientSecret,
    // OrangeCat's token endpoint accepts ONLY client_secret_post (it answers
    // basic with a misleading 400 "client_id is required"); the shared sign-in
    // speaks the same. PKCE is required even for confidential clients.
    tokenEndpointAuth: { method: "client_secret_post" },
    pkce: true,
    scopes: ["openid", "profile", "email"],
    // Who signed in, never their provider address: see placeholderEmail.
    mapProfileToUser: (profile) => {
      const subject = String(profile.sub ?? profile.id ?? "");
      if (!subject)
        throw new Error(`${client.providerId}: id_token has no sub`);
      const handle =
        typeof profile.preferred_username === "string"
          ? profile.preferred_username
          : "";
      return {
        name: handle.replace(/^@/, "").slice(0, 80),
        email: placeholderEmail(client.providerId, subject),
        emailVerified: false,
        image: undefined,
      };
    },
  };
}

export type Auth = ReturnType<typeof betterAuth>;

export function createAuthInstance(options: CreateAuthOptions): Auth {
  const env = options.env ?? process.env;
  const { site, mail } = options;
  const methods = signInMethods(env, mail.configured);
  const providers = oidcClients(env).map(oidcProvider);
  const origin = new URL(site.url);
  const schema = options.schema ?? authSchema;
  const legacyPasswords = options.legacyBcrypt
    ? createPasswordHasher(options.legacyBcrypt)
    : undefined;

  const auth = betterAuth({
    appName: site.title,
    secret: authSecret(env),
    // Pinned, never inferred from the request: behind Caddy the app sees its
    // INTERNAL origin, and links built from it point at localhost.
    baseURL: site.url,
    trustedOrigins: async () => {
      const further =
        typeof site.trustedOrigins === "function"
          ? await site.trustedOrigins().catch(() => [])
          : (site.trustedOrigins ?? []);
      return [origin.origin, ...further.map((o) => new URL(o).origin)];
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    database: drizzleAdapter(options.database as any, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        passkey: schema.passkey,
        twoFactor: schema.twoFactor,
        // A product's own plugin tables (organization, member, …) by model name.
        ...Object.fromEntries(
          Object.entries(schema).filter(([model]) => !(model in authSchema)),
        ),
      },
    }),
    telemetry: { enabled: false },
    // One rate limiter, keyed on the proxy's hop (./limits), run by the route
    // handler. better-auth's own would key on the first X-Forwarded-For entry,
    // which the caller chooses.
    rateLimit: { enabled: false },
    advanced: {
      useSecureCookies: env.NODE_ENV === "production",
      // An IP address next to a session is personal data the product does not need.
      ipAddress: { disableIpTracking: true },
      cookiePrefix: site.slug,
    },
    session: {
      expiresIn: 14 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      // Changing a password, a passkey or 2FA needs a session younger than this.
      freshAge: 15 * 60,
    },
    user: {
      additionalFields: {
        // Never accepted from the person: a sign-up body carrying role: "admin" is ignored.
        role: {
          type: "string",
          required: false,
          defaultValue: DEFAULT_ROLE,
          input: false,
        },
      },
      deleteUser: { enabled: true },
      changeEmail: { enabled: mail.configured },
    },
    account: {
      accountLinking: {
        enabled: true,
        // An address is never an identity: a new sign-in method joins an
        // account only when the signed-in person links it from their account page.
        disableImplicitLinking: true,
        allowDifferentEmails: true,
      },
      encryptOAuthTokens: true,
    },
    databaseHooks: {
      account: {
        // The product needs to know WHO signed in, not to act at the provider
        // on their behalf, so provider tokens are dropped before they are stored.
        create: {
          // Runs just before the sign-in method is stored, when the person's
          // row already exists. (better-auth's `after` hooks are queued behind
          // a transaction this adapter never opens, and did not fire.)
          before: async (data) => {
            try {
              await options.onAccountCreated?.({
                userId: String(data.userId),
                providerId: String(data.providerId),
                accountId: String(data.accountId),
              });
            } catch (error) {
              console.error(
                `[auth] onAccountCreated failed: ${(error as Error).name}`,
              );
            }
            return {
              data: {
                ...data,
                accessToken: null,
                refreshToken: null,
                idToken: null,
              },
            };
          },
        },
        update: {
          before: async (data) => ({
            data: {
              ...data,
              accessToken: null,
              refreshToken: null,
              idToken: null,
            },
          }),
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      ...(legacyPasswords
        ? {
            password: {
              hash: hashPassword,
              verify: async (input: { password: string; hash: string }) => {
                if (/^(?:\$bs1\$|\$2[aby]\$)/.test(input.hash)) {
                  return (
                    await legacyPasswords.verify(input.password, input.hash)
                  ).valid;
                }
                return verifyPassword(input);
              },
            },
          }
        : {}),
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      autoSignIn: !methods.verifyEmail,
      // Without mail a verification link could never arrive, and requiring
      // one would strand every new account.
      requireEmailVerification: methods.verifyEmail,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: mail.configured
        ? async ({ user, url, token }) => {
            // Remember which address the link went to, so using it verifies
            // that address (./recovery-verification).
            await recordResetAddress(
              (await auth.$context).internalAdapter,
              token,
              user,
            );
            await mail.send("reset", user.email, url);
          }
        : undefined,
    },
    emailVerification: {
      sendOnSignUp: methods.verifyEmail,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) =>
        mail.send("verify", user.email, url),
    },
    plugins: [
      ...(options.domainCredentials
        ? [domainCredentialsPlugin(options.domainCredentials)]
        : []),
      ...(options.provisioning
        ? [
            provisioningPlugin(options.provisioning, {
              requireEmailVerification: methods.verifyEmail,
            }),
          ]
        : []),
      recoveryVerificationPlugin(),
      ...(options.sessionLifetime
        ? [sessionLifetimePlugin(options.sessionLifetime)]
        : []),
      // allowPasswordless: someone who signs in only by passkey, link or OIDC can
      // still add a second factor (with a fresh session instead of a password).
      factorForAllMethods(site),
      passkey({
        rpID: origin.hostname,
        rpName: site.title,
        origin: origin.origin,
      }),
      ...(methods.magicLink
        ? [
            magicLink({
              expiresIn: 10 * 60,
              sendMagicLink: async ({ email, url }) =>
                mail.send("magicLink", email, url),
            }),
          ]
        : []),
      ...(providers.length > 0 ? [genericOAuth({ config: providers })] : []),
      ...(options.plugins ?? []),
      // Lets server actions set cookies; keep it last.
      nextCookies(),
    ],
  });
  // The inferred type names zod internals and cannot be published; the base
  // type carries every call the products make (api.getSession, handler).
  return auth as unknown as Auth;
}
