/**
 * Every word the account screens show, so each product can say them in its
 * own language. Placeholders are `{email}`, `{method}` and `{word}`; a product
 * on next-intl passes `t.raw(...)`, which keeps them as written.
 */
/**
 * The one password rule: a length. No character classes, no symbols — a
 * longer password is the person's choice, not a gate (NIST SP 800-63B).
 */
export const MIN_PASSWORD_LENGTH = 8;
export const DEFAULT_RECOVERY_LABELS = {
    forgot: "Forgot your password?",
    send: "Email me a reset link",
    sent: "If an account can be recovered at that address, a reset link will arrive shortly. Check your inbox and spam folder.",
    reset: "Reset password",
    newPassword: "New password",
    confirmPassword: "Repeat new password",
    mismatch: "The passwords do not match. Enter the same password in both fields.",
    invalidToken: "This reset link is invalid or has expired. Request a new link.",
    success: "Your password has been changed. Sign in with your new password.",
};
export const DEFAULT_AUTH_LABELS = {
    passwordVisibility: { show: "Show password", hide: "Hide password" },
    recovery: DEFAULT_RECOVERY_LABELS,
    signIn: "Sign in",
    createAccount: "Create an account",
    withSignin: "Continue with Google, Apple, GitHub, X or Facebook",
    withOrangecat: "Continue with OrangeCat",
    withPasskey: "Sign in with a passkey",
    withLink: "Email me a sign-in link instead",
    signUpWithLink: "Email me a link instead",
    orEmail: "or with email",
    email: "Email",
    password: "Password",
    passwordHint: "At least 8 characters.",
    displayName: "Display name",
    displayNameHint: "Optional. Anything you like — it does not have to be your real name.",
    checkInbox: "We sent a link to {email}. Open it on this device to continue. It works for 10 minutes.",
    confirmInbox: "We sent a link to {email}. Open it to confirm your address and finish creating your account.",
    back: "Back",
    totpPrompt: "Enter the 6-digit code from your authenticator app.",
    backupPrompt: "Enter one of the backup codes you saved when you set up two-factor sign-in.",
    totpCode: "Code",
    backupCode: "Backup code",
    trustDevice: "Trust this device for 30 days",
    verify: "Verify",
    useTotp: "Use the authenticator app instead",
    useBackup: "Use a backup code instead",
    resendVerification: "Send the confirmation link again",
    noAccount: "No account yet?",
    haveAccount: "Already have an account?",
    errors: {
        rateLimited: "Too many attempts. Wait a few minutes, then try again.",
        unavailable: "Accounts are not available right now. Try again in a little while.",
        generic: "That did not work. Try again, or choose another way to sign in.",
        emailFirst: "Enter your email address first.",
        INVALID_EMAIL_OR_PASSWORD: "That email and password do not match. Check both, or sign in with a link instead.",
        EMAIL_NOT_VERIFIED: "Confirm your email address first — the link is in your inbox.",
        USER_ALREADY_EXISTS: "There is already an account with this address. Sign in instead.",
        USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "There is already an account with this address. Sign in instead.",
        PASSWORD_TOO_SHORT: "The password needs at least 8 characters.",
        PASSWORD_TOO_LONG: "The password can have at most 128 characters.",
        INVALID_EMAIL: "That does not look like an email address.",
        INVALID_CODE: "That code is not right, or it has expired. Try the newest one.",
        INVALID_TWO_FACTOR_CODE: "That code is not right, or it has expired. Try the newest one.",
        SESSION_EXPIRED: "For your safety, sign in again before changing this.",
        INVALID_PASSWORD: "That password is not right.",
    },
    account: {
        profile: "Profile",
        noEmail: "none — add a password sign-in to use email",
        unverified: "not confirmed yet",
        role: "Role",
        roles: {
            customer: "Customer",
            helper: "Helper",
            professional: "Professional",
            staff: "Staff",
            admin: "Administrator",
        },
        save: "Save",
        saved: "Saved.",
        methods: "Ways to sign in",
        methodPassword: "Email and password",
        link: "Add {method}",
        passkeys: "Passkeys",
        passkeysLede: "Sign in with your fingerprint, face or device PIN instead of a password.",
        passkeyDefaultName: "Passkey",
        remove: "Remove",
        addPasskey: "Add a passkey",
        twoFactor: "Two-factor sign-in",
        twoFactorOn: "On. Signing in asks for a code from your authenticator app.",
        twoFactorOff: "Off. Turn it on to ask for a code from an authenticator app at every sign-in.",
        currentPassword: "Current password",
        currentPasswordHint: "Needed if your account has a password. Without one, sign in again first.",
        scan: "Add this account to your authenticator app, then enter the code it shows.",
        openAuthenticator: "Open in your authenticator app",
        backupCodes: "Keep these backup codes somewhere safe. Each one works once if you lose your phone.",
        turnOn: "Turn on",
        turnOff: "Turn off",
        setUp: "Set up",
        leave: "Sign out or leave",
        signOut: "Sign out",
        deleteConfirm: "To delete your account and everything in it, type {word}",
        deleteWord: "delete",
        delete: "Delete my account",
    },
};
/** Put values into a label: `fill("Hi {name}", { name: "Ada" })`. */
export function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, (whole, key) => values[key] ?? whole);
}
const KNOWN = new Set([
    "INVALID_EMAIL_OR_PASSWORD",
    "EMAIL_NOT_VERIFIED",
    "USER_ALREADY_EXISTS",
    "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
    "PASSWORD_TOO_SHORT",
    "PASSWORD_TOO_LONG",
    "INVALID_EMAIL",
    "INVALID_CODE",
    "INVALID_TWO_FACTOR_CODE",
    "SESSION_EXPIRED",
    "INVALID_PASSWORD",
]);
/**
 * A failure in words, never a raw code: what happened and what to do next.
 * Unknown codes get the generic sentence — a provider's message can carry
 * details the person should not be shown.
 */
export function authErrorText(labels, error) {
    if (!error)
        return null;
    if (error.status === 429)
        return labels.errors.rateLimited;
    if (error.status === 503)
        return labels.errors.unavailable;
    if (error.code && KNOWN.has(error.code)) {
        return labels.errors[error.code];
    }
    return labels.errors.generic;
}
//# sourceMappingURL=labels.js.map