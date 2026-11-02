import { randomUUID } from "node:crypto";
import { passkey } from "@better-auth/passkey";
import { betterAuth, } from "better-auth";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { decryptOAuthToken } from "better-auth/oauth2";
import { genericOAuth, magicLink } from "better-auth/plugins";
import { oidcClients, productGithubApp, placeholderEmail, signInMethods, } from "./methods.js";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./password.js";
import { DEFAULT_ROLE } from "./roles.js";
import { authSchema } from "./schema.js";
import { factorForAllMethods } from "./factor.js";
import { mintSignInCode, signInCodePlugins } from "./sign-in-code.js";
import { createPasswordHasher } from "./hash.js";
import { domainCredentialsPlugin, } from "./domain-credentials.js";
import { provisioningPlugin, } from "./provisioning.js";
import { sessionLifetimePlugin, } from "./session-lifetime.js";
import { recordResetAddress, recoveryVerificationPlugin, } from "./recovery-verification.js";
/**
 * Accounts for a bitbaum product: better-auth 1.x on Drizzle + pg, configured
 * the same way everywhere (fleet STACK.md, "Identity"). A product passes in
 * what is its own — its address, its database, its mail — and gets the same
 * methods, limits, cookie rules and account-linking rules as every other.
 */
const MIN_SECRET_LENGTH = 32;
const DEV_SECRET = "development-only-secret-never-used-in-production-0000";
/**
 * The `providerId` onAccountCreated receives for a person created without a
 * sign-in method (an email sign-in link to a new address).
 */
export const NO_SIGN_IN_METHOD = "none";
/**
 * The session secret: BETTER_AUTH_SECRET, or the AUTH_SECRET a product moving
 * off next-auth already has on its server (better-auth reads the same pair).
 * Either way it must be 32+ characters in production.
 */
export function secretFrom(env) {
    return (env.BETTER_AUTH_SECRET?.trim() || env.AUTH_SECRET?.trim()) ?? "";
}
export function authStatusFor(databaseConfigured, env = process.env) {
    if (!databaseConfigured)
        return { ready: false, reason: "no_database" };
    const secret = secretFrom(env);
    if (env.NODE_ENV === "production" && secret.length < MIN_SECRET_LENGTH) {
        return { ready: false, reason: "no_secret" };
    }
    return { ready: true };
}
function authSecret(env) {
    const secret = secretFrom(env);
    if (secret.length >= MIN_SECRET_LENGTH)
        return secret;
    if (env.NODE_ENV === "production") {
        throw new Error("BETTER_AUTH_SECRET is missing or shorter than 32 characters");
    }
    return DEV_SECRET;
}
/** An OIDC client as better-auth's generic OAuth provider. */
export function oidcProvider(client) {
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
            const handle = typeof profile.preferred_username === "string"
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
/** The tokens on an account about to be stored, as the provider sent them. */
async function providerTokens(data, context) {
    // better-auth has already encrypted them (encryptOAuthTokens) by now.
    const token = async (value) => typeof value === "string" && value
        ? context
            ? await decryptOAuthToken(value, context)
            : value
        : null;
    const text = (value) => typeof value === "string" && value ? value : null;
    const expires = data.accessTokenExpiresAt;
    return {
        accessToken: await token(data.accessToken),
        refreshToken: await token(data.refreshToken),
        idToken: await token(data.idToken),
        accessTokenExpiresAt: expires instanceof Date
            ? expires
            : expires
                ? new Date(String(expires))
                : null,
        scope: text(data.scope),
    };
}
export function createAuthInstance(options) {
    const env = options.env ?? process.env;
    const { site, mail } = options;
    const methods = signInMethods(env, mail.configured, {
        emailConfirmation: options.emailConfirmation,
    });
    const providers = oidcClients(env).map(oidcProvider);
    const github = productGithubApp(env, options.githubSignIn);
    const origin = new URL(site.url);
    const schema = options.schema ?? authSchema;
    const legacyPasswords = options.legacyBcrypt
        ? createPasswordHasher(options.legacyBcrypt)
        : undefined;
    const legacyFormat = options.legacyPassword;
    const auth = betterAuth({
        appName: site.title,
        secret: authSecret(env),
        // Pinned, never inferred from the request: behind Caddy the app sees its
        // INTERNAL origin, and links built from it point at localhost.
        baseURL: site.url,
        trustedOrigins: async () => {
            const further = typeof site.trustedOrigins === "function"
                ? await site.trustedOrigins().catch(() => [])
                : (site.trustedOrigins ?? []);
            return [origin.origin, ...further.map((o) => new URL(o).origin)];
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        database: drizzleAdapter(options.database, {
            provider: "pg",
            schema: {
                user: schema.user,
                session: schema.session,
                account: schema.account,
                verification: schema.verification,
                passkey: schema.passkey,
                twoFactor: schema.twoFactor,
                // A product's own plugin tables (organization, member, …) by model name.
                ...Object.fromEntries(Object.entries(schema).filter(([model]) => !(model in authSchema))),
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
            ...(options.ids === "uuid"
                ? { database: { generateId: () => randomUUID() } }
                : {}),
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
            deleteUser: { enabled: options.accountDeletion !== false },
            changeEmail: { enabled: mail.configured },
        },
        ...(github
            ? {
                socialProviders: {
                    github: {
                        clientId: github.clientId,
                        clientSecret: github.clientSecret,
                        scope: options.githubScopes ?? [],
                    },
                },
            }
            : {}),
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
            user: {
                create: {
                    // Runs once the person's row exists (after the sign-up's own
                    // transaction, which also stores its first sign-in method). A person
                    // who already has one was reported as it was attached (below); one
                    // created without any (an email sign-in link) is reported here, so
                    // onAccountCreated reaches every new person exactly once.
                    after: async (user, context) => {
                        if (!options.onAccountCreated)
                            return;
                        const userId = String(user.id);
                        try {
                            const internal = context?.context.internalAdapter ??
                                (await auth.$context).internalAdapter;
                            if ((await internal.findAccounts(userId)).length > 0)
                                return;
                            await options.onAccountCreated({
                                userId,
                                providerId: NO_SIGN_IN_METHOD,
                                accountId: userId,
                                tokens: {
                                    accessToken: null,
                                    refreshToken: null,
                                    idToken: null,
                                    accessTokenExpiresAt: null,
                                    scope: null,
                                },
                            });
                        }
                        catch (error) {
                            console.error(`[auth] onAccountCreated failed: ${error.name}`);
                        }
                    },
                },
                delete: {
                    // Queued until the deletion is done (sessions, sign-in methods and
                    // the person), so a refusal before it never reaches the product.
                    after: async (user) => {
                        if (!options.onAccountDeleted)
                            return;
                        try {
                            await options.onAccountDeleted({
                                userId: String(user.id),
                                email: String(user.email ?? ""),
                            });
                        }
                        catch (error) {
                            console.error(`[auth] onAccountDeleted failed: ${error.name}`);
                        }
                    },
                },
            },
            account: {
                // The product needs to know WHO signed in, not to act at the provider
                // on their behalf, so provider tokens are dropped before they are stored.
                create: {
                    // Runs just before the sign-in method is stored, when the person's
                    // row already exists. (better-auth's `after` hooks are queued behind
                    // a transaction this adapter never opens, and did not fire.)
                    before: async (data, context) => {
                        const account = {
                            userId: String(data.userId),
                            providerId: String(data.providerId),
                            accountId: String(data.accountId),
                        };
                        try {
                            await options.onAccountCreated?.({
                                ...account,
                                tokens: await providerTokens(data, context?.context),
                            });
                        }
                        catch (error) {
                            console.error(`[auth] onAccountCreated failed: ${error.name}`);
                        }
                        // A product's mirror may have recorded this very method for this
                        // person just now (its own row, written in the hook above); left
                        // in place it would collide with the row about to be stored.
                        if (options.onAccountCreated &&
                            account.providerId !== "credential") {
                            await context?.context.adapter.deleteMany({
                                model: "account",
                                where: [
                                    { field: "providerId", value: account.providerId },
                                    { field: "accountId", value: account.accountId },
                                    { field: "userId", value: account.userId },
                                ],
                            });
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
            ...(legacyPasswords || legacyFormat
                ? {
                    password: {
                        hash: hashPassword,
                        verify: async (input) => {
                            if (legacyFormat?.matches(input.hash)) {
                                return legacyFormat.verify(input.password, input.hash);
                            }
                            if (legacyPasswords &&
                                /^(?:\$bs1\$|\$2[aby]\$)/.test(input.hash)) {
                                return (await legacyPasswords.verify(input.password, input.hash)).valid;
                            }
                            return verifyPassword(input);
                        },
                    },
                }
                : {}),
            minPasswordLength: MIN_PASSWORD_LENGTH,
            maxPasswordLength: MAX_PASSWORD_LENGTH,
            autoSignIn: !methods.verifyEmail,
            // Only a product that opted into "before-sign-in", and only with mail:
            // without mail a link could never arrive and would strand every account.
            requireEmailVerification: methods.verifyEmail,
            revokeSessionsOnPasswordReset: true,
            sendResetPassword: mail.configured
                ? async ({ user, url, token }) => {
                    // Remember which address the link went to, so using it verifies
                    // that address (./recovery-verification).
                    await recordResetAddress((await auth.$context).internalAdapter, token, user);
                    await mail.send("reset", user.email, url);
                }
                : undefined,
        },
        emailVerification: {
            // With mail, every sign-up gets a confirmation link, wall or not.
            sendOnSignUp: mail.configured,
            autoSignInAfterVerification: true,
            sendVerificationEmail: async ({ user, url }) => mail.send("verify", user.email, url),
        },
        plugins: [
            ...(options.domainCredentials
                ? [domainCredentialsPlugin(options.domainCredentials)]
                : []),
            ...(options.provisioning
                ? [
                    provisioningPlugin(options.provisioning, {
                        requireEmailVerification: methods.verifyEmail,
                        sendVerification: mail.configured,
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
                        sendMagicLink: async ({ email, url }) => {
                            const code = mail.codes
                                ? await mintSignInCode(auth.api, email)
                                : undefined;
                            await mail.send("magicLink", email, url, code ? { code } : undefined);
                        },
                    }),
                    ...(mail.codes ? signInCodePlugins() : []),
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
    return auth;
}
//# sourceMappingURL=server.js.map