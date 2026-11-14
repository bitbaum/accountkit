import { type ReactNode } from "react";
import type { SignInMethods } from "./methods.js";
import { DEFAULT_AUTH_LABELS, authErrorText, fill, type AuthError, type AuthLabels } from "./labels.js";
import { type LightningClient } from "./lightning-login.js";
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
/**
 * The only two calls the recovery form makes. A product on Better Auth passes
 * its client; a product on Auth.js (or anything else) passes a small adapter
 * with these two functions, so it need not implement the rest of the client.
 * A call may resolve `{ error }` or reject (a network failure): the form
 * leaves its busy state and shows the unavailable message in both cases.
 */
export interface PasswordRecoveryClient {
    requestPasswordReset?(input: {
        email: string;
        redirectTo: string;
    }): Result;
    resetPassword?(input: {
        newPassword: string;
        token: string;
    }): Result;
}
/** What these screens call on the product's better-auth client. */
export interface AuthClientLike extends PasswordRecoveryClient {
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
            /** Extra authorize parameters; AccountKit sends OIDC `ui_locales`. */
            additionalParams?: Record<string, string>;
        }): Result;
        magicLink(input: {
            email: string;
            name?: string;
            callbackURL?: string;
            errorCallbackURL?: string;
        }): Result<object>;
        /** better-auth's emailOTPClient (in authClientPlugins): the code from the link's email. */
        emailOtp?(input: {
            email: string;
            otp: string;
        }): Result<object>;
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
    /** lightningClient() from ./client (in authClientPlugins). */
    lightning?: LightningClient;
    /**
     * better-auth's own request function: the code door and ClaimForm call the
     * product's endpoints through it (`/sign-in/domain`, `/provision/claim`).
     */
    $fetch?: (path: string, options: {
        method: "POST";
        body: Record<string, unknown>;
    }) => Promise<unknown>;
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
    /** The box around a password input that holds the show/hide eye. */
    inputWrap: string;
    /** The eye inside the password field. */
    reveal: string;
    /**
     * A way round the form that is not the form's own action ("Email me a
     * sign-in link instead", "Forgot your password?"): text, not a box, so the
     * filled button above it is the one thing the screen asks for.
     */
    textAction: string;
}
/** Class names styled by @bitbaum/accountkit/styles.css on --acct-* variables. */
export declare const DEFAULT_AUTH_CLASSES: AuthClasses;
interface Common {
    client: AuthClientLike;
    methods: SignInMethods;
    labels?: AuthLabels;
    classes?: Partial<AuthClasses>;
    /**
     * The page's language (`de`, `de-CH`), sent to the shared sign-in and
     * OrangeCat as OIDC `ui_locales` so their page speaks it too. Defaults to
     * `<html lang>`.
     */
    locale?: string;
}
/**
 * A product's own code as a way in: what it is called is the product's word
 * (AOZ: "Zugangscode", `AOZ-XXXXXX` or `RES-XXXXXX`); the server verifies it
 * as a domain credential (`domainCredentials`), which refuses an account
 * with a second factor and never lets a code session change account security.
 */
export interface CodeDoor {
    /** The quiet button that opens it ("Mit Code anmelden"). */
    open: string;
    /** The field's label ("Zugangscode"). */
    label: string;
    placeholder?: string;
    hint?: string;
    /** The product's codes are capitals: what is typed is shown and sent so. */
    uppercase?: boolean;
    /** A personal link carries the code in this query parameter: open the code and sign in once. */
    param?: string;
    /** Open the code first, for a product whose people mostly hold one. */
    first?: boolean;
}
/**
 * "Continue with …" for each OIDC method this deployment has switched on.
 * OrangeCat, the fleet's own account, comes first; the shared sign-in
 * ("Continue with Google or GitHub") follows it. In the other order the
 * shared button read as a heading over the OrangeCat one (BiasLens sign-in,
 * 2026-11-12).
 */
export declare function OidcButtons({ client, methods, labels, classes, callbackURL, errorCallbackURL, onError, locale, }: Common & {
    callbackURL: string;
    errorCallbackURL: string;
    onError: (error: AuthError) => void;
}): import("react").JSX.Element | null;
/**
 * Every way in, on one screen: password, passkey, a link by email, and the
 * OIDC buttons this deployment has switched on. A second factor, when the
 * account has one, is asked for on the same card.
 */
export declare function SignInForm({ client, methods, labels, classes, locale, next, signInPath, signUpLink, initialError, codeDoor, }: Common & {
    /** Where to land, already localised (`/de/account`). */
    next: string;
    /** This page, localised: where a failed OIDC round trip comes back to. */
    signInPath: string;
    /** The link to the sign-up page, rendered by the product's router. */
    signUpLink: ReactNode;
    initialError?: boolean;
    /** A product's own code as a way in, beside everything else (see CodeDoor). */
    codeDoor?: CodeDoor;
}): import("react").JSX.Element;
export { PasswordRecoveryForm } from "./recovery.js";
export { uiLocalesFor } from "./ui-locales.js";
/**
 * A new account in one step. No real name is asked for — a display name is
 * optional and may be anything. A passkey is added from the account page once
 * the account exists.
 */
export declare function SignUpForm({ client, methods, labels, classes, locale, next, signUpPath, signInPath, signInLink, }: Common & {
    next: string;
    signUpPath: string;
    /** Where an existing account completes a second factor after passwordless signup. */
    signInPath?: string;
    /** The link to the sign-in page, rendered by the product's router. */
    signInLink: ReactNode;
}): import("react").JSX.Element;
/** Everything about one's own account, and the way out of it. */
export declare function AccountPanel({ client, methods, labels, classes, user, linked, accountPath, homePath, deletion, ownProfile, }: Common & {
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
    /**
     * What the panel offers in place of deleting the account, for a product
     * created with `accountDeletion: false`: its own way, such as a link to an
     * erasure request. Without it, the delete control.
     */
    deletion?: ReactNode;
    /**
     * True when the product shows and edits the person's name on its own page
     * (its own row is the one every table reads): the panel then leaves its
     * Profile section out, so one person never has two names that drift apart.
     */
    ownProfile?: boolean;
}): import("react").JSX.Element;
export { DEFAULT_AUTH_LABELS, authErrorText, fill, type AuthError, type AuthLabels, };
/**
 * What a claim proves: a code the person types, or one the page already holds
 * (a personal claim link's token). `prefix` (or the given credential) is the
 * product's format for its provisioning (AOZ: `code:…`, `link:…`).
 */
export type ClaimProof = {
    kind: "code";
    /** The field's label ("Zugangscode"). */
    label: string;
    placeholder?: string;
    hint?: string;
    uppercase?: boolean;
    /** Put before the typed code to make the credential the server resolves. */
    prefix?: string;
    /** A code already known (a link that carried it). */
    initial?: string;
} | {
    kind: "given";
    credential: string;
};
/**
 * Claiming an identity the product provisioned: a code or a claim link, an
 * email and a first password, sent to AccountKit's `/provision/claim` (the
 * server's `provisioning`). The server decides everything that matters: the
 * proof is taken once; an address already in use joins only on its own
 * password; a confirmed address of the identity must match. This form says
 * what happened in AccountKit's words and moves on: signed in, asked to
 * confirm the address, or asked to sign in for a second factor.
 */
export declare function ClaimForm({ client, labels, classes, next, signInPath, signInLink, proof, }: Common & {
    /** Where to land once signed in. */
    next: string;
    /** The sign-in page, for a claim that still owes a second factor. */
    signInPath: string;
    /** The link to the sign-in page, rendered by the product's router. */
    signInLink: ReactNode;
    proof: ClaimProof;
}): import("react").JSX.Element;
//# sourceMappingURL=react.d.ts.map