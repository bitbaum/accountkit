import { type ReactNode } from "react";
import type { SignInMethods } from "./methods.js";
import { DEFAULT_AUTH_LABELS, authErrorText, fill, type AuthError, type AuthLabels } from "./labels.js";
/**
 * The account screens every product shows: sign in, create an account, and
 * the account page. Logic and words here, look in the product: pass `classes`
 * with your own class names and `labels` in your own language. The client is
 * the product's own (`createAuthClient({ plugins: authClientPlugins() })`).
 */
type Result<T = unknown> = Promise<{
    data?: T | null;
    error?: AuthError;
}>;
/** What these screens call on the product's better-auth client. */
export interface AuthClientLike {
    requestPasswordReset?(input: {
        email: string;
        redirectTo: string;
    }): Result;
    resetPassword?(input: {
        newPassword: string;
        token: string;
    }): Result;
    signIn: {
        email(input: {
            email: string;
            password: string;
            callbackURL?: string;
        }): Result;
        social(input: {
            provider: string;
            callbackURL?: string;
            errorCallbackURL?: string;
        }): Result;
        magicLink(input: {
            email: string;
            name?: string;
            callbackURL?: string;
        }): Result;
        passkey(): Promise<{
            error?: AuthError;
        } | undefined | null>;
    };
    signUp: {
        email(input: {
            name: string;
            email: string;
            password: string;
            callbackURL?: string;
        }): Result;
    };
    signOut(): Result;
    sendVerificationEmail(input: {
        email: string;
        callbackURL?: string;
    }): Result;
    updateUser(input: {
        name: string;
    }): Result;
    deleteUser(input: {
        password?: string;
    }): Result;
    linkSocial(input: {
        provider: string;
        callbackURL?: string;
    }): Result;
    twoFactor: {
        verifyTotp(input: {
            code: string;
            trustDevice?: boolean;
        }): Result;
        verifyBackupCode(input: {
            code: string;
            trustDevice?: boolean;
        }): Result;
        enable(input: {
            password?: string;
        }): Result<object>;
        disable(input: {
            password?: string;
        }): Result;
    };
    passkey: {
        addPasskey(input: {
            name?: string;
        }): Promise<{
            error?: AuthError;
        } | undefined | null>;
        listUserPasskeys(): Result<Passkey[]>;
        deletePasskey(input: {
            id: string;
        }): Result;
    };
}
type Passkey = {
    id: string;
    name?: string | null;
};
export interface AuthClasses {
    button: string;
    buttonQuiet: string;
    input: string;
    label: string;
    hint: string;
    notice: string;
    error: string;
    section: string;
    sectionTitle: string;
    divider: string;
    link: string;
    stack: string;
    field: string;
    check: string;
}
/** Class names styled by @bitbaum/accountkit/styles.css on --acct-* variables. */
export declare const DEFAULT_AUTH_CLASSES: AuthClasses;
interface Common {
    client: AuthClientLike;
    methods: SignInMethods;
    labels?: AuthLabels;
    classes?: Partial<AuthClasses>;
}
/** "Continue with …" for each OIDC method this deployment has switched on. */
export declare function OidcButtons({ client, methods, labels, classes, callbackURL, errorCallbackURL, onError, }: Common & {
    callbackURL: string;
    errorCallbackURL: string;
    onError: (error: AuthError) => void;
}): import("react").JSX.Element | null;
/**
 * Every way in, on one screen: password, passkey, a link by email, and the
 * OIDC buttons this deployment has switched on. A second factor, when the
 * account has one, is asked for on the same card.
 */
export declare function SignInForm({ client, methods, labels, classes, next, signInPath, signUpLink, initialError, }: Common & {
    /** Where to land, already localised (`/de/account`). */
    next: string;
    /** This page, localised: where a failed OIDC round trip comes back to. */
    signInPath: string;
    /** The link to the sign-up page, rendered by the product's router. */
    signUpLink: ReactNode;
    initialError?: boolean;
}): import("react").JSX.Element;
export { PasswordRecoveryForm } from "./recovery.js";
/**
 * A new account in one step. No real name is asked for — a display name is
 * optional and may be anything. A passkey is added from the account page once
 * the account exists.
 */
export declare function SignUpForm({ client, methods, labels, classes, next, signUpPath, signInLink, }: Common & {
    next: string;
    signUpPath: string;
    /** The link to the sign-in page, rendered by the product's router. */
    signInLink: ReactNode;
}): import("react").JSX.Element;
/** Everything about one's own account, and the way out of it. */
export declare function AccountPanel({ client, methods, labels, classes, user, linked, accountPath, homePath, }: Common & {
    user: {
        name: string;
        /** Null when the account has no address that can receive mail. */
        email: string | null;
        emailVerified: boolean;
        role: string;
        twoFactorEnabled: boolean;
    };
    /** Provider ids of the sign-in methods this account has ("credential", "orangecat", …). */
    linked: string[];
    accountPath: string;
    homePath: string;
}): import("react").JSX.Element;
export { DEFAULT_AUTH_LABELS, authErrorText, fill, type AuthError, type AuthLabels, };
//# sourceMappingURL=react.d.ts.map