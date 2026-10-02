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
export function signInErrorKind(
  error: string | null | undefined,
): SignInErrorKind {
  if (error === "AccessDenied") return "denied";
  if (error === "Configuration") return "configuration";
  return "failed";
}

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

const DEFAULT_LABELS: SignInErrorLabels = {
  kicker: "Sign in",
  failedTitle: "Sign-in did not finish",
  failedBody:
    "Nothing was changed. Start again — it usually works the second time. If it keeps failing, OrangeCat may be briefly unavailable.",
  deniedTitle: "This account cannot sign in here",
  deniedBody:
    "OrangeCat signed you in, but this app could not accept the account.",
  configurationTitle: "Sign-in is not available right now",
  configurationBody:
    "Sign-in is not set up on this server yet. Nothing you did caused this.",
  tryAgain: "Try again",
  home: "Back to the start",
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

export function SignInError({
  error,
  retry,
  retryFields,
  home = "/",
  children,
  labels: overrides,
  className,
}: SignInErrorProps) {
  const labels = { ...DEFAULT_LABELS, ...overrides };
  const kind = signInErrorKind(error);
  const title = labels[`${kind}Title`];
  const body = labels[`${kind}Body`];
  // Retrying a server with no client configured fails the same way again.
  const canRetry = kind !== "configuration";
  // A denial is answered elsewhere first (the app's children), so the retry
  // steps back to a secondary button there.
  const retryClass = `acct-signin-button ${kind === "denied" && children ? "is-secondary" : ""}`;

  return (
    <section
      className={`acct-signin-error ${className ?? ""}`.trim()}
      aria-labelledby="acct-signin-error-title"
      data-kind={kind}
    >
      <p className="acct-signin-kicker">{labels.kicker}</p>
      <h1 id="acct-signin-error-title" className="acct-signin-title">
        {title}
      </h1>
      <p className="acct-signin-body">{body}</p>
      <div className="acct-signin-actions">
        {children}
        {canRetry &&
          (typeof retry === "string" ? (
            <a className={retryClass} href={retry}>
              {labels.tryAgain}
            </a>
          ) : (
            <form action={retry}>
              {Object.entries(retryFields ?? {}).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              <button type="submit" className={retryClass}>
                {labels.tryAgain}
              </button>
            </form>
          ))}
        <a className="acct-signin-home" href={home}>
          {labels.home}
        </a>
      </div>
    </section>
  );
}
