/**
 * The tables better-auth and its passkey and two-factor plugins expect, as
 * Drizzle tables. Every product re-exports these from its own schema file:
 *
 *   export * from "@bitbaum/accountkit/auth/schema";
 *
 * so drizzle-kit generates ONE migration for accounts that is identical in
 * every product. A column that drifts here does not fail the build, it fails
 * at sign-in, which is why this lives in one place.
 *
 * Pseudonymous by default: `name` may be empty and is never required to be
 * real. A method that brings no email gets an address under `.invalid`
 * (see methods.ts `placeholderEmail`).
 */
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, } from "drizzle-orm/pg-core";
import { DEFAULT_ROLE } from "./roles.js";
const timestamps = {
    createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
};
/**
 * The account tables under a name prefix, for a product whose own tables
 * already use these names (a NextAuth `users`, say): its domain keeps its
 * tables and the shared ones sit beside them, identical in every column.
 * Pass the result as `schema` to the runtime. No prefix gives the standard set.
 */
export function createAuthTables(prefix = "") {
    const user = pgTable(`${prefix}users`, {
        id: text("id").primaryKey(),
        name: text("name").notNull().default(""),
        email: text("email").notNull().unique(),
        emailVerified: boolean("email_verified").notNull().default(false),
        image: text("image"),
        /** What this person is to the product. Never set by the person: sign-up ignores it. */
        role: text("role").notNull().default(DEFAULT_ROLE),
        twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
        ...timestamps,
    });
    const session = pgTable(`${prefix}sessions`, {
        id: text("id").primaryKey(),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        token: text("token").notNull().unique(),
        // Left empty on purpose: IP tracking is switched off.
        ipAddress: text("ip_address"),
        userAgent: text("user_agent"),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        ...timestamps,
    }, (t) => [index(`${prefix}sessions_user_id_idx`).on(t.userId)]);
    const account = pgTable(`${prefix}accounts`, {
        id: text("id").primaryKey(),
        accountId: text("account_id").notNull(),
        providerId: text("provider_id").notNull(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        // Provider tokens are never kept: the product needs to know WHO signed in.
        accessToken: text("access_token"),
        refreshToken: text("refresh_token"),
        idToken: text("id_token"),
        accessTokenExpiresAt: timestamp("access_token_expires_at", {
            withTimezone: true,
        }),
        refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
            withTimezone: true,
        }),
        scope: text("scope"),
        /** A slow, salted hash (scrypt). Never a plaintext secret. */
        password: text("password"),
        ...timestamps,
    }, (t) => [
        index(`${prefix}accounts_user_id_idx`).on(t.userId),
        // One local person per provider identity.
        uniqueIndex(`${prefix}accounts_provider_account_uidx`).on(t.providerId, t.accountId),
    ]);
    const verification = pgTable(`${prefix}verifications`, {
        id: text("id").primaryKey(),
        identifier: text("identifier").notNull(),
        value: text("value").notNull(),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        ...timestamps,
    }, (t) => [index(`${prefix}verifications_identifier_idx`).on(t.identifier)]);
    const passkey = pgTable(`${prefix}passkeys`, {
        id: text("id").primaryKey(),
        name: text("name"),
        publicKey: text("public_key").notNull(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        credentialID: text("credential_id").notNull().unique(),
        counter: integer("counter").notNull(),
        deviceType: text("device_type").notNull(),
        backedUp: boolean("backed_up").notNull(),
        transports: text("transports"),
        aaguid: text("aaguid"),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    }, (t) => [index(`${prefix}passkeys_user_id_idx`).on(t.userId)]);
    const twoFactor = pgTable(`${prefix}two_factors`, {
        id: text("id").primaryKey(),
        /** Encrypted by better-auth with BETTER_AUTH_SECRET before it is stored. */
        secret: text("secret").notNull(),
        backupCodes: text("backup_codes").notNull(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        verified: boolean("verified").default(true),
        failedVerificationCount: integer("failed_verification_count").default(0),
        lockedUntil: timestamp("locked_until", { withTimezone: true }),
    }, (t) => [
        index(`${prefix}two_factors_user_id_idx`).on(t.userId),
        index(`${prefix}two_factors_secret_idx`).on(t.secret),
    ]);
    return { user, session, account, verification, passkey, twoFactor };
}
export const authSchema = createAuthTables();
export const { user, session, account, verification, passkey, twoFactor } = authSchema;
//# sourceMappingURL=schema.js.map