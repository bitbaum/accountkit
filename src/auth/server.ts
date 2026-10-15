import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth, magicLink, twoFactor } from "better-auth/plugins";
import type { GenericOAuthConfig } from "better-auth/plugins";
import {
  oidcClients,
  placeholderEmail,
  signInMethods,
  type OidcClient,
} from "./methods.js";
import { DEFAULT_ROLE } from "./roles.js";
import { authSchema } from "./schema.js";

/**
 * Accounts for a bitbaum product: better-auth 1.x on Drizzle + pg, configured
 * the same way everywhere (fleet STACK.md, "Identity"). A product passes in
 * what is its own — its address, its database, its mail — and gets the same
 * methods, limits, cookie rules and account-linking rules as every other.
 */
const MIN_SECRET_LENGTH = 32;
const DEV_SECRET = "development-only-secret-never-used-in-production-0000";

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
}

export interface CreateAuthOptions {
  site: AuthSite;
  /** A Drizzle node-postgres or pglite database holding the tables in ./schema. */
  database: unknown;
  /** Defaults to this package's tables; pass your own only if you must. */
  schema?: Record<string, unknown>;
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

export function authStatusFor(
  databaseConfigured: boolean,
  env: NodeJS.ProcessEnv = process.env,
): AuthStatus {
  if (!databaseConfigured) return { ready: false, reason: "no_database" };
  const secret = env.BETTER_AUTH_SECRET?.trim() ?? "";
  if (env.NODE_ENV === "production" && secret.length < MIN_SECRET_LENGTH) {
    return { ready: false, reason: "no_secret" };
  }
  return { ready: true };
}

function authSecret(env: NodeJS.ProcessEnv): string {
  const secret = env.BETTER_AUTH_SECRET?.trim() ?? "";
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

  const auth = betterAuth({
    appName: site.title,
    secret: authSecret(env),
    // Pinned, never inferred from the request: behind Caddy the app sees its
    // INTERNAL origin, and links built from it point at localhost.
    baseURL: site.url,
    trustedOrigins: [origin.origin],
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
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: !methods.verifyEmail,
      // Without mail a verification link could never arrive, and requiring
      // one would strand every new account.
      requireEmailVerification: methods.verifyEmail,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) =>
        mail.send("reset", user.email, url),
    },
    emailVerification: {
      sendOnSignUp: methods.verifyEmail,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) =>
        mail.send("verify", user.email, url),
    },
    plugins: [
      // allowPasswordless: someone who signs in only by passkey, link or OIDC can
      // still add a second factor (with a fresh session instead of a password).
      twoFactor({ issuer: site.title, allowPasswordless: true }),
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
      // Lets server actions set cookies; keep it last.
      nextCookies(),
    ],
  });
  // The inferred type names zod internals and cannot be published; the base
  // type carries every call the products make (api.getSession, handler).
  return auth as unknown as Auth;
}
