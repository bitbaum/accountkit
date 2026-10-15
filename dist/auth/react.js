"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState, } from "react";
import { DEFAULT_AUTH_LABELS, authErrorText, fill, } from "./labels.js";
/** Class names styled by @bitbaum/accountkit/styles.css on --acct-* variables. */
export const DEFAULT_AUTH_CLASSES = {
    button: "acct-auth-button",
    buttonQuiet: "acct-auth-button-quiet",
    input: "acct-auth-input",
    label: "acct-auth-label",
    hint: "acct-auth-hint",
    notice: "acct-auth-notice",
    error: "acct-auth-error",
    section: "acct-auth-section",
    sectionTitle: "acct-auth-section-title",
    divider: "acct-auth-divider",
    link: "acct-auth-link",
    stack: "acct-auth-stack",
    field: "acct-auth-field",
    check: "acct-auth-check",
};
const merge = (c) => ({
    ...DEFAULT_AUTH_CLASSES,
    ...c,
});
function ErrorLine({ message, className, }) {
    if (!message)
        return null;
    return (_jsx("p", { role: "alert", className: className, children: message }));
}
function Divider({ label, className }) {
    return (_jsx("div", { className: className, role: "separator", children: _jsx("span", { children: label }) }));
}
/** "Continue with …" for each OIDC method this deployment has switched on. */
export function OidcButtons({ client, methods, labels = DEFAULT_AUTH_LABELS, classes, callbackURL, errorCallbackURL, onError, }) {
    const c = merge(classes);
    const [busy, setBusy] = useState(null);
    const providers = [
        methods.signin ? { id: "bitbaum-signin", label: labels.withSignin } : null,
        methods.orangecat ? { id: "orangecat", label: labels.withOrangecat } : null,
    ].filter((p) => p !== null);
    if (providers.length === 0)
        return null;
    return (_jsx("div", { className: c.stack, children: providers.map((provider) => (_jsx("button", { type: "button", className: c.buttonQuiet, disabled: busy !== null, onClick: async () => {
                setBusy(provider.id);
                const { error } = await client.signIn.social({
                    provider: provider.id,
                    callbackURL,
                    errorCallbackURL,
                });
                if (error) {
                    onError(error);
                    setBusy(null);
                }
            }, children: provider.label }, provider.id))) }));
}
/**
 * Every way in, on one screen: password, passkey, a link by email, and the
 * OIDC buttons this deployment has switched on. A second factor, when the
 * account has one, is asked for on the same card.
 */
export function SignInForm({ client, methods, labels = DEFAULT_AUTH_LABELS, classes, next, signInPath, signUpLink, initialError = false, }) {
    const c = merge(classes);
    const [step, setStep] = useState("start");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [useBackup, setUseBackup] = useState(false);
    const [trustDevice, setTrustDevice] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(initialError ? labels.errors.generic : null);
    const [unverified, setUnverified] = useState(false);
    const fail = (e) => {
        setError(authErrorText(labels, e));
        setUnverified(e?.code === "EMAIL_NOT_VERIFIED");
        setBusy(false);
    };
    const done = () => window.location.assign(next);
    async function withPassword(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        const { data, error: e } = await client.signIn.email({
            email,
            password,
            callbackURL: next,
        });
        if (e)
            return fail(e);
        if (data &&
            typeof data === "object" &&
            "twoFactorRedirect" in data &&
            data.twoFactorRedirect) {
            setStep("twoFactor");
            setBusy(false);
            return;
        }
        done();
    }
    async function withSecondFactor(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        const input = { code: code.trim(), trustDevice };
        const { error: e } = useBackup
            ? await client.twoFactor.verifyBackupCode(input)
            : await client.twoFactor.verifyTotp(input);
        if (e)
            return fail(e);
        done();
    }
    async function withLink() {
        if (!email)
            return setError(labels.errors.emailFirst);
        setBusy(true);
        setError(null);
        const { error: e } = await client.signIn.magicLink({
            email,
            callbackURL: next,
        });
        if (e)
            return fail(e);
        setStep("linkSent");
        setBusy(false);
    }
    async function withPasskey() {
        setBusy(true);
        setError(null);
        const result = await client.signIn.passkey();
        if (result?.error)
            return fail(result.error);
        done();
    }
    async function resendVerification() {
        setBusy(true);
        const { error: e } = await client.sendVerificationEmail({
            email,
            callbackURL: next,
        });
        if (e)
            return fail(e);
        setUnverified(false);
        setStep("linkSent");
        setBusy(false);
    }
    if (step === "linkSent") {
        return (_jsxs("div", { className: c.stack, children: [_jsx("p", { className: c.notice, role: "status", children: fill(labels.checkInbox, { email }) }), _jsx("button", { type: "button", className: c.buttonQuiet, onClick: () => setStep("start"), children: labels.back })] }));
    }
    if (step === "twoFactor") {
        return (_jsxs("form", { onSubmit: withSecondFactor, className: c.stack, children: [_jsx("p", { className: c.hint, children: useBackup ? labels.backupPrompt : labels.totpPrompt }), _jsxs("div", { className: c.field, children: [_jsx("label", { htmlFor: "acct-code", className: c.label, children: useBackup ? labels.backupCode : labels.totpCode }), _jsx("input", { id: "acct-code", className: c.input, inputMode: useBackup ? "text" : "numeric", autoComplete: "one-time-code", value: code, onChange: (e) => setCode(e.target.value), required: true })] }), _jsxs("label", { className: c.check, children: [_jsx("input", { type: "checkbox", checked: trustDevice, onChange: (e) => setTrustDevice(e.target.checked) }), labels.trustDevice] }), _jsx(ErrorLine, { message: error, className: c.error }), _jsx("button", { type: "submit", className: c.button, disabled: busy, children: labels.verify }), _jsx("button", { type: "button", className: c.buttonQuiet, onClick: () => setUseBackup(!useBackup), children: useBackup ? labels.useTotp : labels.useBackup })] }));
    }
    return (_jsxs("div", { className: c.stack, children: [_jsx(OidcButtons, { client: client, methods: methods, labels: labels, classes: classes, callbackURL: next, errorCallbackURL: `${signInPath}?error=oidc`, onError: fail }), methods.passkey && (_jsx("button", { type: "button", className: c.buttonQuiet, onClick: withPasskey, disabled: busy, children: labels.withPasskey })), _jsx(Divider, { label: labels.orEmail, className: c.divider }), _jsxs("form", { onSubmit: withPassword, className: c.stack, children: [_jsxs("div", { className: c.field, children: [_jsx("label", { htmlFor: "acct-email", className: c.label, children: labels.email }), _jsx("input", { id: "acct-email", type: "email", className: c.input, autoComplete: "username webauthn", value: email, onChange: (e) => setEmail(e.target.value), required: true })] }), _jsxs("div", { className: c.field, children: [_jsx("label", { htmlFor: "acct-password", className: c.label, children: labels.password }), _jsx("input", { id: "acct-password", type: "password", className: c.input, autoComplete: "current-password", value: password, onChange: (e) => setPassword(e.target.value), required: true })] }), _jsx(ErrorLine, { message: error, className: c.error }), unverified && methods.verifyEmail && (_jsx("button", { type: "button", className: c.buttonQuiet, onClick: resendVerification, disabled: busy, children: labels.resendVerification })), _jsx("button", { type: "submit", className: c.button, disabled: busy, children: labels.signIn }), methods.magicLink && (_jsx("button", { type: "button", className: c.buttonQuiet, onClick: withLink, disabled: busy, children: labels.withLink }))] }), _jsxs("p", { className: c.hint, children: [labels.noAccount, " ", signUpLink] })] }));
}
/**
 * A new account in one step. No real name is asked for — a display name is
 * optional and may be anything. A passkey is added from the account page once
 * the account exists.
 */
export function SignUpForm({ client, methods, labels = DEFAULT_AUTH_LABELS, classes, next, signUpPath, signInLink, }) {
    const c = merge(classes);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [sent, setSent] = useState(null);
    const fail = (e) => {
        setError(authErrorText(labels, e));
        setBusy(false);
    };
    async function submit(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        const { error: e } = await client.signUp.email({
            name: name.trim(),
            email,
            password,
            callbackURL: next,
        });
        if (e)
            return fail(e);
        if (methods.verifyEmail) {
            setSent("verify");
            setBusy(false);
            return;
        }
        window.location.assign(next);
    }
    async function withLink() {
        if (!email)
            return setError(labels.errors.emailFirst);
        setBusy(true);
        setError(null);
        const { error: e } = await client.signIn.magicLink({
            email,
            name: name.trim(),
            callbackURL: next,
        });
        if (e)
            return fail(e);
        setSent("link");
        setBusy(false);
    }
    if (sent) {
        return (_jsx("p", { className: c.notice, role: "status", children: fill(sent === "verify" ? labels.confirmInbox : labels.checkInbox, {
                email,
            }) }));
    }
    return (_jsxs("div", { className: c.stack, children: [_jsx(OidcButtons, { client: client, methods: methods, labels: labels, classes: classes, callbackURL: next, errorCallbackURL: `${signUpPath}?error=oidc`, onError: fail }), _jsx(Divider, { label: labels.orEmail, className: c.divider }), _jsxs("form", { onSubmit: submit, className: c.stack, children: [_jsxs("div", { className: c.field, children: [_jsx("label", { htmlFor: "acct-name", className: c.label, children: labels.displayName }), _jsx("input", { id: "acct-name", className: c.input, autoComplete: "nickname", maxLength: 80, value: name, onChange: (e) => setName(e.target.value), "aria-describedby": "acct-name-hint" }), _jsx("p", { id: "acct-name-hint", className: c.hint, children: labels.displayNameHint })] }), _jsxs("div", { className: c.field, children: [_jsx("label", { htmlFor: "acct-email", className: c.label, children: labels.email }), _jsx("input", { id: "acct-email", type: "email", className: c.input, autoComplete: "email", value: email, onChange: (e) => setEmail(e.target.value), required: true })] }), _jsxs("div", { className: c.field, children: [_jsx("label", { htmlFor: "acct-password", className: c.label, children: labels.password }), _jsx("input", { id: "acct-password", type: "password", className: c.input, autoComplete: "new-password", minLength: 12, maxLength: 128, value: password, onChange: (e) => setPassword(e.target.value), "aria-describedby": "acct-password-hint", required: true }), _jsx("p", { id: "acct-password-hint", className: c.hint, children: labels.passwordHint })] }), _jsx(ErrorLine, { message: error, className: c.error }), _jsx("button", { type: "submit", className: c.button, disabled: busy, children: labels.createAccount }), methods.magicLink && (_jsx("button", { type: "button", className: c.buttonQuiet, onClick: withLink, disabled: busy, children: labels.signUpWithLink }))] }), _jsxs("p", { className: c.hint, children: [labels.haveAccount, " ", signInLink] })] }));
}
function Section({ title, id, classes, children, }) {
    return (_jsxs("section", { className: classes.section, "aria-labelledby": id, children: [_jsx("h2", { id: id, className: classes.sectionTitle, children: title }), children] }));
}
/** Everything about one's own account, and the way out of it. */
export function AccountPanel({ client, methods, labels = DEFAULT_AUTH_LABELS, classes, user, linked, accountPath, homePath, }) {
    const c = merge(classes);
    const a = labels.account;
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [name, setName] = useState(user.name);
    const [saved, setSaved] = useState(false);
    const [passkeys, setPasskeys] = useState(null);
    const [totp, setTotp] = useState(null);
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [twoFactor, setTwoFactor] = useState(user.twoFactorEnabled);
    const [confirmDelete, setConfirmDelete] = useState("");
    const fail = (e) => {
        setError(authErrorText(labels, e) ?? labels.errors.generic);
        setBusy(false);
    };
    const loadPasskeys = useCallback(async () => {
        const { data } = await client.passkey.listUserPasskeys();
        setPasskeys(data ?? []);
    }, [client]);
    useEffect(() => {
        let alive = true;
        void client.passkey.listUserPasskeys().then(({ data }) => {
            if (alive)
                setPasskeys(data ?? []);
        });
        return () => {
            alive = false;
        };
    }, [client]);
    async function saveName(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        const { error: e } = await client.updateUser({ name: name.trim() });
        if (e)
            return fail(e);
        setSaved(true);
        setBusy(false);
    }
    async function addPasskey() {
        setBusy(true);
        setError(null);
        const result = await client.passkey.addPasskey({
            name: a.passkeyDefaultName,
        });
        if (result?.error)
            return fail(result.error);
        await loadPasskeys();
        setBusy(false);
    }
    async function removePasskey(id) {
        setBusy(true);
        const { error: e } = await client.passkey.deletePasskey({ id });
        if (e)
            return fail(e);
        await loadPasskeys();
        setBusy(false);
    }
    async function startTwoFactor() {
        setBusy(true);
        setError(null);
        const { data, error: e } = await client.twoFactor.enable({
            password: password || undefined,
        });
        if (e)
            return fail(e);
        if (!data || !("totpURI" in data))
            return fail({});
        const setup = data;
        setTotp({ uri: setup.totpURI, backupCodes: setup.backupCodes });
        setBusy(false);
    }
    async function confirmTwoFactor(event) {
        event.preventDefault();
        setBusy(true);
        const { error: e } = await client.twoFactor.verifyTotp({
            code: code.trim(),
        });
        if (e)
            return fail(e);
        setTwoFactor(true);
        setTotp(null);
        setCode("");
        setBusy(false);
    }
    async function stopTwoFactor() {
        setBusy(true);
        setError(null);
        const { error: e } = await client.twoFactor.disable({
            password: password || undefined,
        });
        if (e)
            return fail(e);
        setTwoFactor(false);
        setBusy(false);
    }
    async function link(provider) {
        setBusy(true);
        const { error: e } = await client.linkSocial({
            provider,
            callbackURL: accountPath,
        });
        if (e)
            fail(e);
    }
    async function signOut() {
        await client.signOut();
        window.location.assign(homePath);
    }
    async function deleteAccount() {
        setBusy(true);
        const { error: e } = await client.deleteUser({
            password: password || undefined,
        });
        if (e)
            return fail(e);
        window.location.assign(homePath);
    }
    const oidc = [
        { id: "bitbaum-signin", label: labels.withSignin, on: methods.signin },
        { id: "orangecat", label: labels.withOrangecat, on: methods.orangecat },
    ];
    const methodName = (id) => id === "credential"
        ? a.methodPassword
        : (oidc.find((o) => o.id === id)?.label ?? id);
    return (_jsxs("div", { className: c.stack, children: [_jsx(ErrorLine, { message: error, className: c.error }), _jsx(Section, { title: a.profile, id: "acct-profile", classes: c, children: _jsxs("form", { onSubmit: saveName, className: c.stack, children: [_jsxs("div", { className: c.field, children: [_jsx("label", { htmlFor: "acct-display-name", className: c.label, children: labels.displayName }), _jsx("input", { id: "acct-display-name", className: c.input, maxLength: 80, value: name, onChange: (e) => {
                                        setName(e.target.value);
                                        setSaved(false);
                                    } })] }), _jsxs("dl", { className: c.hint, children: [_jsxs("div", { children: [_jsxs("dt", { style: { display: "inline" }, children: [labels.email, ": "] }), _jsxs("dd", { style: { display: "inline", margin: 0 }, children: [user.email ?? a.noEmail, user.email && !user.emailVerified && ` (${a.unverified})`] })] }), _jsxs("div", { children: [_jsxs("dt", { style: { display: "inline" }, children: [a.role, ": "] }), _jsx("dd", { style: { display: "inline", margin: 0 }, children: a.roles[user.role] ?? user.role })] })] }), _jsxs("div", { children: [_jsx("button", { type: "submit", className: c.button, disabled: busy, children: a.save }), " ", saved && _jsx("span", { role: "status", children: a.saved })] })] }) }), _jsxs(Section, { title: a.methods, id: "acct-methods", classes: c, children: [_jsx("ul", { className: c.hint, children: linked.map((id) => (_jsx("li", { children: methodName(id) }, id))) }), _jsx("div", { className: c.stack, children: oidc
                            .filter((o) => o.on && !linked.includes(o.id))
                            .map((o) => (_jsx("button", { type: "button", className: c.buttonQuiet, onClick: () => link(o.id), disabled: busy, children: fill(a.link, { method: o.label }) }, o.id))) })] }), _jsxs(Section, { title: a.passkeys, id: "acct-passkeys", classes: c, children: [_jsx("p", { className: c.hint, children: a.passkeysLede }), passkeys && passkeys.length > 0 && (_jsx("ul", { className: c.stack, children: passkeys.map((p) => (_jsxs("li", { children: [_jsx("span", { children: p.name || a.passkeyDefaultName }), " ", _jsx("button", { type: "button", className: c.buttonQuiet, onClick: () => removePasskey(p.id), disabled: busy, children: a.remove })] }, p.id))) })), _jsx("button", { type: "button", className: c.button, onClick: addPasskey, disabled: busy, children: a.addPasskey })] }), _jsxs(Section, { title: a.twoFactor, id: "acct-two-factor", classes: c, children: [_jsx("p", { className: c.hint, children: twoFactor ? a.twoFactorOn : a.twoFactorOff }), _jsxs("div", { className: c.field, children: [_jsx("label", { htmlFor: "acct-current-password", className: c.label, children: a.currentPassword }), _jsx("input", { id: "acct-current-password", type: "password", className: c.input, autoComplete: "current-password", value: password, onChange: (e) => setPassword(e.target.value), "aria-describedby": "acct-current-password-hint" }), _jsx("p", { id: "acct-current-password-hint", className: c.hint, children: a.currentPasswordHint })] }), totp ? (_jsxs("form", { onSubmit: confirmTwoFactor, className: c.stack, children: [_jsx("p", { className: c.notice, children: a.scan }), _jsx("a", { href: totp.uri, className: c.link, children: a.openAuthenticator }), _jsx("p", { className: c.hint, children: a.backupCodes }), _jsx("ul", { className: c.hint, children: totp.backupCodes.map((backup) => (_jsx("li", { children: _jsx("code", { children: backup }) }, backup))) }), _jsxs("div", { className: c.field, children: [_jsx("label", { htmlFor: "acct-totp", className: c.label, children: labels.totpCode }), _jsx("input", { id: "acct-totp", className: c.input, inputMode: "numeric", autoComplete: "one-time-code", value: code, onChange: (e) => setCode(e.target.value), required: true })] }), _jsx("button", { type: "submit", className: c.button, disabled: busy, children: a.turnOn })] })) : twoFactor ? (_jsx("button", { type: "button", className: c.buttonQuiet, onClick: stopTwoFactor, disabled: busy, children: a.turnOff })) : (_jsx("button", { type: "button", className: c.button, onClick: startTwoFactor, disabled: busy, children: a.setUp }))] }), _jsx(Section, { title: a.leave, id: "acct-leave", classes: c, children: _jsxs("div", { className: c.stack, children: [_jsx("button", { type: "button", className: c.buttonQuiet, onClick: signOut, children: a.signOut }), _jsxs("div", { className: c.field, children: [_jsx("label", { htmlFor: "acct-confirm-delete", className: c.label, children: fill(a.deleteConfirm, { word: a.deleteWord }) }), _jsx("input", { id: "acct-confirm-delete", className: c.input, value: confirmDelete, onChange: (e) => setConfirmDelete(e.target.value) })] }), _jsx("button", { type: "button", className: c.buttonQuiet, onClick: deleteAccount, disabled: busy ||
                                confirmDelete.trim().toLowerCase() !== a.deleteWord.toLowerCase(), children: a.delete })] }) })] }));
}
export { DEFAULT_AUTH_LABELS, authErrorText, fill, };
//# sourceMappingURL=react.js.map