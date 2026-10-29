/**
 * Why a claim (./provisioning) was refused, as stable codes a product's screen
 * turns into its own words. Safe to import in the browser.
 */
export const CLAIM_ERRORS = {
  invalid: "CLAIM_INVALID",
  alreadyClaimed: "CLAIM_ALREADY_CLAIMED",
  emailTaken: "CLAIM_EMAIL_TAKEN",
  emailNeedsRecovery: "CLAIM_EMAIL_NEEDS_RECOVERY",
  linkPasswordMismatch: "CLAIM_LINK_PASSWORD_MISMATCH",
  verifiedEmailMismatch: "CLAIM_VERIFIED_EMAIL_MISMATCH",
} as const;

export type ClaimError = (typeof CLAIM_ERRORS)[keyof typeof CLAIM_ERRORS];

/** What a successful claim did: a session, a verification mail, or a sign-in still owed (2FA). */
export type ClaimResult =
  | { status: "signed_in"; userId: string }
  | { status: "verify_email"; userId: string }
  | { status: "sign_in"; userId: string };
