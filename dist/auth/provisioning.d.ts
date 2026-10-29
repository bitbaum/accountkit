import { z } from "zod";
/**
 * A product identity that exists before its person has a password: an invited
 * colleague, a resident who signs in with a code, a placeholder profile.
 *
 * The product proves WHICH identity (a single-use invitation, an exact login
 * code). AccountKit owns everything about the credential: the first password,
 * the address it is attached to, its verification, and the proof of an
 * existing account before a second identity joins it.
 */
export interface ProvisionedIdentity {
    /** The shared user that holds this identity now. Never derived from an email. */
    userId: string;
    /**
     * Move this identity onto another shared user, AFTER AccountKit verified that
     * user's own password. Omit to refuse linking: an address already in use
     * then fails the claim. Must be idempotent, and must not touch credentials.
     */
    link?: (targetUserId: string) => Promise<void>;
    /** Called once the claim succeeded, with the user now holding the identity (consume a single-use proof here). */
    complete?: (userId: string) => Promise<void>;
    /** Called when the claim fails after `resolve`: give back a proof taken for it. */
    release?: () => Promise<void>;
}
export interface AccountProvisioning {
    /**
     * Resolve a product proof to the identity it names, or null. A single-use
     * proof should be TAKEN here (and given back in `release`) so that two
     * concurrent claims cannot both succeed.
     */
    resolve(credential: string): Promise<ProvisionedIdentity | null>;
}
export declare function provisioningPlugin(provisioning: AccountProvisioning, options: {
    requireEmailVerification: boolean;
}): {
    id: string;
    endpoints: {
        claimAccount: import("better-auth").StrictEndpoint<"/provision/claim", {
            method: "POST";
            use: import("better-auth").Middleware<import("better-auth").MiddlewareOptions, (inputContext: import("better-auth").MiddlewareInputContext<import("better-auth").MiddlewareOptions>) => Promise<void>>[];
            body: z.ZodObject<{
                credential: z.ZodString;
                email: z.ZodEmail;
                password: z.ZodString;
                name: z.ZodOptional<z.ZodString>;
                callbackURL: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        }, {
            status: "signed_in";
            userId: string;
            success: boolean;
        } | {
            status: "verify_email";
            userId: string;
            success: boolean;
        } | {
            status: "sign_in";
            userId: string;
            success: boolean;
        }>;
    };
};
//# sourceMappingURL=provisioning.d.ts.map