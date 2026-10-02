import type { ReactNode } from "react";
/**
 * Where Auth.js sends a sign-in that did not finish (`pages.error`).
 *
 * Every app had a different one: loki, skif and substrata showed Auth.js's
 * bare "Error" page; heidi's "Try again" went to the home page, which is not
 * trying again. Solon's was right, and this is it: "Try again" STARTS the
 * sign-in again, directly, without another screen in between.
 *
 * It never prints the provider's error code. The codes mean nothing to a
 * visitor and are a gift to anyone probing the endpoint; the operator's copy
 * belongs in the server log.
 *
 * No hooks, no "use client": it renders in a server component, and `retry`
 * may be a server action.
 */
export type SignInErrorKind = "failed" | "denied" | "configuration";
/** Auth.js's `?error=` code → what the person is told. Anything unknown is "failed". */
export declare function signInErrorKind(error: string | null | undefined): SignInErrorKind;
export type SignInErrorLabels = {
    kicker: string;
    failedTitle: string;
    failedBody: string;
    deniedTitle: string;
    deniedBody: string;
    configurationTitle: string;
    configurationBody: string;
    tryAgain: string;
    home: string;
};
export type SignInErrorProps = {
    /** Auth.js's `?error=` search param, as received. Never shown. */
    error?: string | null;
    /**
     * How "Try again" restarts sign-in: a server action that calls
     * `signIn("orangecat", …)`, or the URL of a GET route that does.
     * Never the home page.
     */
    retry: string | ((formData: FormData) => void | Promise<void>);
    /** Hidden fields posted with a server-action retry (`from`, `locale`). */
    retryFields?: Record<string, string>;
    /** Where "Back to the start" goes. */
    home?: string;
    /** More ways on, shown first — e.g. "Add an email on OrangeCat" for a denial. */
    children?: ReactNode;
    labels?: Partial<SignInErrorLabels>;
    className?: string;
};
export declare function SignInError({ error, retry, retryFields, home, children, labels: overrides, className, }: SignInErrorProps): import("react").JSX.Element;
//# sourceMappingURL=SignInError.d.ts.map