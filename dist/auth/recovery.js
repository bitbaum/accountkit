"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useId, useRef, useState } from "react";
import { returnPath } from "../paths.js";
import { DEFAULT_AUTH_LABELS, DEFAULT_RECOVERY_LABELS, authErrorText, } from "./labels.js";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./password.js";
import { DEFAULT_AUTH_CLASSES, } from "./react.js";
/** The same request/reset journey on every product's existing sign-in page. */
export function PasswordRecoveryForm({ client, methods, signInPath, next, onBack, token: initialToken, initialEmail = "", invalidToken = false, labels = DEFAULT_AUTH_LABELS, classes, }) {
    const c = { ...DEFAULT_AUTH_CLASSES, ...classes };
    const words = labels.recovery ?? DEFAULT_RECOVERY_LABELS;
    const id = useId();
    const root = useRef(null);
    const [token, setToken] = useState(initialToken);
    const [email, setEmail] = useState(initialEmail);
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(invalidToken ? words.invalidToken : null);
    const canRequest = methods.passwordReset && !!client.requestPasswordReset;
    useEffect(() => {
        root.current?.querySelector("input, [role='status']")?.focus();
    }, [status, token]);
    async function submit(event) {
        event.preventDefault();
        if (token && password !== confirm) {
            setError(words.mismatch);
            return;
        }
        setError(null);
        setBusy(true);
        try {
            if (token) {
                if (!client.resetPassword) {
                    setError(labels.errors.unavailable);
                    return;
                }
                const { error: failure } = await client.resetPassword({
                    newPassword: password,
                    token,
                });
                if (failure) {
                    if (["INVALID_TOKEN", "TOKEN_EXPIRED", "INVALID_RESET_TOKEN"].includes(failure.code ?? "")) {
                        setToken(undefined);
                        setError(words.invalidToken);
                    }
                    else
                        setError(authErrorText(labels, failure));
                    return;
                }
                setToken(undefined);
                setPassword("");
                setConfirm("");
                setStatus("reset");
            }
            else {
                if (!canRequest || !client.requestPasswordReset) {
                    setError(labels.errors.unavailable);
                    return;
                }
                const redirect = new URL(returnPath(signInPath), window.location.origin);
                redirect.searchParams.delete("token");
                redirect.searchParams.delete("error");
                redirect.searchParams.set("next", returnPath(next));
                const { error: failure } = await client.requestPasswordReset({
                    email,
                    redirectTo: redirect.href,
                });
                if (failure) {
                    setError(authErrorText(labels, failure));
                    return;
                }
                setStatus("sent");
            }
        }
        catch {
            setError(labels.errors.unavailable);
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("div", { ref: root, className: c.stack, children: [status ? (_jsx("p", { role: "status", tabIndex: -1, className: c.notice, children: status === "sent" ? words.sent : words.success })) : (_jsxs("form", { className: c.stack, onSubmit: submit, "aria-busy": busy, children: [token ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: c.field, children: [_jsx("label", { className: c.label, htmlFor: `${id}-password`, children: words.newPassword }), _jsx("input", { className: c.input, id: `${id}-password`, type: "password", autoComplete: "new-password", minLength: MIN_PASSWORD_LENGTH, maxLength: MAX_PASSWORD_LENGTH, required: true, value: password, disabled: busy, onChange: (event) => setPassword(event.target.value) })] }), _jsxs("div", { className: c.field, children: [_jsx("label", { className: c.label, htmlFor: `${id}-confirm`, children: words.confirmPassword }), _jsx("input", { className: c.input, id: `${id}-confirm`, type: "password", autoComplete: "new-password", minLength: MIN_PASSWORD_LENGTH, maxLength: MAX_PASSWORD_LENGTH, required: true, value: confirm, disabled: busy, onChange: (event) => setConfirm(event.target.value) })] })] })) : canRequest ? (_jsxs("div", { className: c.field, children: [_jsx("label", { className: c.label, htmlFor: `${id}-email`, children: labels.email }), _jsx("input", { className: c.input, id: `${id}-email`, type: "email", autoComplete: "email", required: true, value: email, disabled: busy, onChange: (event) => setEmail(event.target.value) })] })) : (_jsx("p", { role: "status", className: c.notice, children: labels.errors.unavailable })), error && (_jsx("p", { role: "alert", className: c.error, children: error })), (token || canRequest) && (_jsx("button", { className: c.button, type: "submit", disabled: busy, children: token ? words.reset : words.send }))] })), _jsx("button", { type: "button", className: c.buttonQuiet, disabled: busy, onClick: onBack, children: labels.signIn })] }));
}
//# sourceMappingURL=recovery.js.map