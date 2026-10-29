/**
 * Why a claim (./provisioning) was refused, as stable codes a product's screen
 * turns into its own words. Safe to import in the browser.
 */
export declare const CLAIM_ERRORS: {
    readonly invalid: "CLAIM_INVALID";
    readonly alreadyClaimed: "CLAIM_ALREADY_CLAIMED";
    readonly emailTaken: "CLAIM_EMAIL_TAKEN";
    readonly emailNeedsRecovery: "CLAIM_EMAIL_NEEDS_RECOVERY";
    readonly linkPasswordMismatch: "CLAIM_LINK_PASSWORD_MISMATCH";
    readonly verifiedEmailMismatch: "CLAIM_VERIFIED_EMAIL_MISMATCH";
};
export type ClaimError = (typeof CLAIM_ERRORS)[keyof typeof CLAIM_ERRORS];
/** What a successful claim did: a session, a verification mail, or a sign-in still owed (2FA). */
export type ClaimResult = {
    status: "signed_in";
    userId: string;
} | {
    status: "verify_email";
    userId: string;
} | {
    status: "sign_in";
    userId: string;
};
//# sourceMappingURL=claim-errors.d.ts.map