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
    /**
     * The shared sign-in's button when no provider list is known (a capability
     * object built before 0.24). `signInMethods` never shows the button without
     * a list, so this is a fallback only.
     */
    withSignin: string;
    /**
     * The shared sign-in's button: `{providers}` is the providers the service
     * publishes, joined with `listOr` ("Google, GitHub or Facebook"). Optional
     * for products that pass their own labels; without it the button reads in
     * the words of `withSignin`'s own pattern, or English.
     */
    withSigninProviders?: string;
    /** The word before the last name of a list of alternatives ("or"). */
    listOr?: string;
    withOrangecat: string;
    /** A product's own GitHub app (`githubSignIn`). Optional; English when absent. */
    withGithub?: string;
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
    /**
     * Under "we sent a link": the same email carries a code to type here
     * (./sign-in-code). Optional for products that pass their own labels.
     */
    codePrompt?: string;
    /** The button that signs in with that code. Optional, as codePrompt. */
    signInWithCode?: string;
    /** Lightning login (./lightning). Optional; English when absent. */
    lightning?: {
        /** The button on the sign-in and sign-up cards. */
        withLightning: string;
        /** The method's name in the account panel ("Add {method}"). */
        name: string;
        prompt: string;
        qr: string;
        open: string;
        expired: string;
        retry: string;
        taken: string;
    };
    /**
     * A product's own code as a way in (SignInForm's `codeDoor`, the server's
     * `domainCredentials`). Optional; English when absent.
     */
    code?: {
        /** The code names nobody, or the request was refused. */
        invalid: string;
        /** The account has a second factor: a code alone cannot open it. */
        needsAnotherMethod: string;
        /** Back from the code to email and password. */
        useEmail: string;
    };
    /**
     * Claiming an identity a product provisioned (ClaimForm, the server's
     * `provisioning`): a code or a claim link, an email and a first password.
     * Optional; English when absent.
     */
    claim?: {
        submit: string;
        /** After a claim that waits for the address to be confirmed. {email} */
        verifyEmail: string;
        /** After a claim that linked an existing account with a second factor. */
        signIn: string;
        invalid: string;
        alreadyClaimed: string;
        emailTaken: string;
        emailNeedsRecovery: string;
        linkPasswordMismatch: string;
        verifiedEmailMismatch: string;
        emailInvalid: string;
    };
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
/**
 * "Continue with Google, GitHub or Facebook" for exactly the providers the
 * shared sign-in publishes, in its order. A product's own labels that predate
 * `withSigninProviders` still read in their language: the template and the
 * word for "or" are taken from their `withSignin` when it has the shape every
 * shipped one had ("<words> Google, …, <or> <last>"); otherwise English.
 */
export declare function signinButtonLabel(labels: AuthLabels, providers: readonly string[] | undefined): string;
//# sourceMappingURL=labels.d.ts.map