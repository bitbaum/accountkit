import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Auth.js's `?error=` code → what the person is told. Anything unknown is "failed". */
export function signInErrorKind(error) {
    if (error === "AccessDenied")
        return "denied";
    if (error === "Configuration")
        return "configuration";
    return "failed";
}
const DEFAULT_LABELS = {
    kicker: "Sign in",
    failedTitle: "Sign-in did not finish",
    failedBody: "Nothing was changed. Start again — it usually works the second time. If it keeps failing, OrangeCat may be briefly unavailable.",
    deniedTitle: "This account cannot sign in here",
    deniedBody: "OrangeCat signed you in, but this app could not accept the account.",
    configurationTitle: "Sign-in is not available right now",
    configurationBody: "Sign-in is not set up on this server yet. Nothing you did caused this.",
    tryAgain: "Try again",
    home: "Back to the start",
};
export function SignInError({ error, retry, retryFields, home = "/", children, labels: overrides, className, }) {
    const labels = { ...DEFAULT_LABELS, ...overrides };
    const kind = signInErrorKind(error);
    const title = labels[`${kind}Title`];
    const body = labels[`${kind}Body`];
    // Retrying a server with no client configured fails the same way again.
    const canRetry = kind !== "configuration";
    // A denial is answered elsewhere first (the app's children), so the retry
    // steps back to a secondary button there.
    const retryClass = `acct-signin-button ${kind === "denied" && children ? "is-secondary" : ""}`;
    return (_jsxs("section", { className: `acct-signin-error ${className ?? ""}`.trim(), "aria-labelledby": "acct-signin-error-title", "data-kind": kind, children: [_jsx("p", { className: "acct-signin-kicker", children: labels.kicker }), _jsx("h1", { id: "acct-signin-error-title", className: "acct-signin-title", children: title }), _jsx("p", { className: "acct-signin-body", children: body }), _jsxs("div", { className: "acct-signin-actions", children: [children, canRetry &&
                        (typeof retry === "string" ? (_jsx("a", { className: retryClass, href: retry, children: labels.tryAgain })) : (_jsxs("form", { action: retry, children: [Object.entries(retryFields ?? {}).map(([name, value]) => (_jsx("input", { type: "hidden", name: name, value: value }, name))), _jsx("button", { type: "submit", className: retryClass, children: labels.tryAgain })] }))), _jsx("a", { className: "acct-signin-home", href: home, children: labels.home })] })] }));
}
//# sourceMappingURL=SignInError.js.map