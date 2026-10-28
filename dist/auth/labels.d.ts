/**
 * Every word the account screens show, so each product can say them in its
 * own language. Placeholders are `{email}`, `{method}` and `{word}`; a product
 * on next-intl passes `t.raw(...)`, which keeps them as written.
 */
export interface RecoveryLabels {
    forgot: string;
    send: string;
    sent: string;
    reset: string;
    newPassword: string;
    invalidToken: string;
    success: string;
}
export declare const DEFAULT_RECOVERY_LABELS: RecoveryLabels;
export interface AuthLabels {
    /** Optional for compatibility with existing product label overrides. */
    passwordVisibility?: {
        show: string;
        hide: string;
    };
    /** Optional for compatibility with existing product label overrides. */
    recovery?: RecoveryLabels;
    signIn: string;
    createAccount: string;
    withSignin: string;
    withOrangecat: string;
    withPasskey: string;
    withLink: string;
    signUpWithLink: string;
    orEmail: string;
    email: string;
    password: string;
    /** @deprecated Sign-up no longer asks for a name; the account page still uses displayName. */
    displayName: string;
    /** @deprecated Unused since sign-up stopped asking for a name. */
    displayNameHint: string;
    checkInbox: string;
    confirmInbox: string;
    back: string;
    totpPrompt: string;
    backupPrompt: string;
    totpCode: string;
    backupCode: string;
    trustDevice: string;
    verify: string;
    useTotp: string;
    useBackup: string;
    resendVerification: string;
    noAccount: string;
    haveAccount: string;
    errors: {
        rateLimited: string;
        unavailable: string;
        generic: string;
        emailFirst: string;
        INVALID_EMAIL_OR_PASSWORD: string;
        EMAIL_NOT_VERIFIED: string;
        USER_ALREADY_EXISTS: string;
        USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: string;
        PASSWORD_TOO_SHORT: string;
        PASSWORD_TOO_LONG: string;
        INVALID_EMAIL: string;
        INVALID_CODE: string;
        INVALID_TWO_FACTOR_CODE: string;
        SESSION_EXPIRED: string;
        INVALID_PASSWORD: string;
    };
    account: {
        profile: string;
        noEmail: string;
        unverified: string;
        role: string;
        roles: Record<string, string>;
        save: string;
        saved: string;
        methods: string;
        methodPassword: string;
        link: string;
        passkeys: string;
        passkeysLede: string;
        passkeyDefaultName: string;
        remove: string;
        addPasskey: string;
        twoFactor: string;
        twoFactorOn: string;
        twoFactorOff: string;
        currentPassword: string;
        currentPasswordHint: string;
        scan: string;
        openAuthenticator: string;
        backupCodes: string;
        turnOn: string;
        turnOff: string;
        setUp: string;
        leave: string;
        signOut: string;
        deleteConfirm: string;
        deleteWord: string;
        delete: string;
    };
}
export declare const DEFAULT_AUTH_LABELS: AuthLabels;
/** Put values into a label: `fill("Hi {name}", { name: "Ada" })`. */
export declare function fill(template: string, values: Record<string, string>): string;
/** The error shape better-auth's client returns, plus our own guard's answers. */
export type AuthError = {
    code?: string;
    status?: number;
    message?: string;
} | null | undefined;
/**
 * A failure in words, never a raw code: what happened and what to do next.
 * Unknown codes get the generic sentence — a provider's message can carry
 * details the person should not be shown.
 */
export declare function authErrorText(labels: AuthLabels, error: AuthError): string | null;
//# sourceMappingURL=labels.d.ts.map