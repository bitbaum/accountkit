import { APIError, createAuthEndpoint, formCsrfMiddleware, originCheckMiddleware, sendVerificationEmailFn, } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import { CLAIM_ERRORS } from "./claim-errors.js";
import { isDeliverable } from "./methods.js";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./password.js";
export function provisioningPlugin(provisioning, options) {
    return {
        id: "accountkit-provisioning",
        endpoints: {
            claimAccount: createAuthEndpoint("/provision/claim", {
                method: "POST",
                use: [formCsrfMiddleware, originCheckMiddleware],
                body: z.object({
                    credential: z.string().min(1).max(1024),
                    email: z.email().max(320),
                    password: z
                        .string()
                        .min(MIN_PASSWORD_LENGTH)
                        .max(MAX_PASSWORD_LENGTH),
                    name: z.string().max(120).optional(),
                    callbackURL: z.string().max(2048).optional(),
                }),
            }, async (ctx) => {
                const email = ctx.body.email.trim().toLowerCase();
                const fail = (status, code, message) => new APIError(status, { code, message });
                // An address that cannot receive mail is never a sign-in address.
                if (!isDeliverable(email))
                    throw fail("FORBIDDEN", CLAIM_ERRORS.invalid, "Use an address that can receive mail");
                const identity = await provisioning.resolve(ctx.body.credential);
                if (!identity)
                    throw fail("UNAUTHORIZED", CLAIM_ERRORS.invalid, "Invalid claim");
                let completed = false;
                try {
                    const adapter = ctx.context.internalAdapter;
                    const target = await adapter.findUserById(identity.userId);
                    if (!target)
                        throw fail("UNAUTHORIZED", CLAIM_ERRORS.invalid, "Invalid claim");
                    // A finished account recovers its password; it is never claimed again.
                    if (await adapter.findCredentialAccount(target.id))
                        throw fail("CONFLICT", CLAIM_ERRORS.alreadyClaimed, "This identity already has a password: sign in or reset it");
                    const owner = await adapter.findUserByEmail(email);
                    let result;
                    if (owner && owner.user.id !== target.id) {
                        // The address belongs to another person's account. It may absorb
                        // this identity only on proof of THAT account, never because the
                        // claimant typed its address.
                        if (!identity.link)
                            throw fail("CONFLICT", CLAIM_ERRORS.emailTaken, "This address belongs to another account");
                        const existing = await adapter.findCredentialAccount(owner.user.id);
                        if (!existing?.password)
                            // Invited, never claimed: its mailbox is the only proof there
                            // is. Recover that account first, then claim with its password.
                            throw fail("CONFLICT", CLAIM_ERRORS.emailNeedsRecovery, "Set this address's password through recovery, then claim again");
                        const valid = await ctx.context.password.verify({
                            hash: existing.password,
                            password: ctx.body.password,
                        });
                        if (!valid)
                            throw fail("UNAUTHORIZED", CLAIM_ERRORS.linkPasswordMismatch, "Enter the existing account's password to link it");
                        await identity.link(owner.user.id);
                        await identity.complete?.(owner.user.id);
                        completed = true;
                        result =
                            "twoFactorEnabled" in owner.user && owner.user.twoFactorEnabled
                                ? // A password is one factor; the session is the sign-in's job.
                                    { status: "sign_in", userId: owner.user.id }
                                : await finish(owner.user.id);
                        return ctx.json({ success: true, ...result });
                    }
                    const sameAddress = target.email.toLowerCase() === email;
                    if (!sameAddress &&
                        isDeliverable(target.email) &&
                        target.emailVerified)
                        // A verified mailbox is not moved by whoever holds the identity proof.
                        throw fail("CONFLICT", CLAIM_ERRORS.verifiedEmailMismatch, "Claim with the address this account already uses");
                    await adapter.updateUser(target.id, {
                        email,
                        emailVerified: sameAddress && target.emailVerified,
                        ...(ctx.body.name && !target.name
                            ? { name: ctx.body.name.trim() }
                            : {}),
                    });
                    await adapter.createAccount({
                        userId: target.id,
                        providerId: "credential",
                        accountId: target.id,
                        password: await ctx.context.password.hash(ctx.body.password),
                    });
                    await identity.complete?.(target.id);
                    completed = true;
                    result = await finish(target.id);
                    return ctx.json({ success: true, ...result });
                }
                finally {
                    if (!completed)
                        await identity.release?.();
                }
                async function finish(userId) {
                    const user = await ctx.context.internalAdapter.findUserById(userId);
                    if (!user)
                        throw fail("UNAUTHORIZED", CLAIM_ERRORS.invalid, "Invalid claim");
                    if (options.requireEmailVerification && !user.emailVerified) {
                        // The same rule as a password sign-in: the mailbox proves the
                        // address before it signs anyone in. The link signs them in.
                        await sendVerificationEmailFn(ctx, user);
                        return { status: "verify_email", userId };
                    }
                    const session = await ctx.context.internalAdapter.createSession(userId);
                    if (!session)
                        throw new APIError("INTERNAL_SERVER_ERROR", {
                            message: "Unable to create session",
                        });
                    await setSessionCookie(ctx, { session, user });
                    return { status: "signed_in", userId };
                }
            }),
        },
    };
}
//# sourceMappingURL=provisioning.js.map