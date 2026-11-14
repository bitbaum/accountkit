"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState, } from "react";
import { PasswordRecoveryForm } from "./recovery.js";
import { unbroken } from "./unbroken.js";
import { UI_LOCALES_PROVIDERS, uiLocalesFor } from "./ui-locales.js";
import { DEFAULT_AUTH_LABELS, authErrorText, fill, signinButtonLabel, signinProvidersBeside, } from "./labels.js";
import { PasswordField } from "./password-field.js";
import { LightningLogin, lightningWords, } from "./lightning-login.js";
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
    inputWrap: "acct-auth-input-wrap",
    reveal: "acct-auth-reveal",
    textAction: "acct-auth-text-action",
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
const hasOidc = (methods) => methods.signin || methods.orangecat || Boolean(methods.github);
function Divider({ label, className }) {
    return (_jsx("div", { className: className, role: "separator", children: _jsx("span", { children: label }) }));
}
async function post(client, path, body) {
    if (!client.$fetch)
        return { ok: false, status: 0, code: "" };
    try {
        const answer = (await client.$fetch(path, { method: "POST", body }));
        if (answer?.error)
            return {
                ok: false,
                status: answer.error.status ?? 0,
                code: answer.error.code ?? "",
            };
        return { ok: true, data: answer?.data ?? {} };
    }
    catch {
        return { ok: false, status: 0, code: "" };
    }
}
function codeWords(labels) {
    return { ...DEFAULT_AUTH_LABELS.code, ...labels.code };
}
function claimWords(labels) {
    return { ...DEFAULT_AUTH_LABELS.claim, ...labels.claim };
}
/** The code door's own form: one field, the product's words, AccountKit's refusals. */
function CodeSignIn({ client, door, labels, classes: c, onDone, onBack, initialCode, }) {
    const w = codeWords(labels);
    const [code, setCode] = useState(initialCode ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const tried = useRef(false);
    const submit = useCallback(async (value) => {
        const credential = value.trim();
        if (!credential)
            return;
        setBusy(true);
        setError(null);
        const answer = await post(client, "/sign-in/domain", { credential });
        if (answer.ok)
            return onDone();
        setBusy(false);
        setError(answer.code === "DOMAIN_CREDENTIAL_REQUIRES_ANOTHER_METHOD"
            ? w.needsAnotherMethod
            : answer.status === 429
                ? labels.errors.rateLimited
                : answer.status === 0
                    ? labels.errors.unavailable
                    : w.invalid);
    }, [client, labels, onDone, w.invalid, w.needsAnotherMethod]);
    // A personal link signs in at once, once: a refusal leaves the field for a retry by hand.
    useEffect(() => {
        if (!initialCode || tried.current)
            return;
        tried.current = true;
        void submit(initialCode);
    }, [initialCode, submit]);
    return (_jsxs("form", { onSubmit: (event) => {
            event.preventDefault();
            void submit(code);
        }, className: c.stack, children: [_jsxs("div", { className: c.field, children: [_jsx("label", { htmlFor: "acct-domain-code", className: c.label, children: door.label }), _jsx("input", { id: "acct-domain-code", className: c.input, autoComplete: "off", autoCapitalize: door.uppercase ? "characters" : undefined, spellCheck: false, placeholder: door.placeholder, value: code, onChange: (e) => setCode(door.uppercase ? e.target.value.toUpperCase() : e.target.value), required: true }), door.hint && _jsx("p", { className: c.hint, children: door.hint })] }), _jsx(ErrorLine, { message: error, className: c.error }), _jsx("button", { type: "submit", className: c.button, disabled: busy, children: unbroken(labels.signIn) }), _jsx("button", { type: "button", className: c.buttonQuiet, onClick: onBack, disabled: busy, children: unbroken(w.useEmail) })] }));
}
/**
 * "Continue with …" for each OIDC method this deployment has switched on.
 * OrangeCat, the fleet's own account, comes first; the shared sign-in
 * ("Continue with Google or GitHub") follows it. In the other order the
 * shared button read as a heading over the OrangeCat one (BiasLens sign-in,
 * 2026-11-12).
 */
export function OidcButtons({ client, methods, labels = DEFAULT_AUTH_LABELS, classes, callbackURL, errorCallbackURL, onError, locale, }) {
    const c = merge(classes);
    const [busy, setBusy] = useState(null);
    const providers = [
        methods.orangecat ? { id: "orangecat", label: labels.withOrangecat } : null,
        methods.signin
            ? {
                id: "bitbaum-signin",
                label: signinButtonLabel(labels, signinProvidersBeside(methods.signinProviders, {
                    github: methods.github,
                })),
            }
            : null,
        methods.github
            ? {
                id: "github",
                label: labels.withGithub ?? DEFAULT_AUTH_LABELS.withGithub,
            }
            : null,
    ].filter((p) => p !== null);
    if (providers.length === 0)
        return null;
    return (_jsx("div", { className: c.stack, children: providers.map((provider) => (_jsx("button", { type: "button", className: c.buttonQuiet, disabled: busy !== null, onClick: async () => {
                setBusy(provider.id);
                const uiLocales = UI_LOCALES_PROVIDERS.includes(provider.id)
                    ? uiLocalesFor(locale)
                    : undefined;
                const { error } = await client.signIn.social({
                    provider: provider.id,
                    callbackURL,
                    errorCallbackURL,
                    ...(uiLocales
                        ? { additionalParams: { ui_locales: uiLocales } }
                        : {}),
                });
                if (error) {
                    onError(error);
                    setBusy(null);
                }
            }, children: unbroken(provider.label) }, provider.id))) }));
}
/**
 * Every way in, on one screen: password, passkey, a link by email, and the
 * OIDC buttons this deployment has switched on. A second factor, when the
 * account has one, is asked for on the same card.
 */
export function SignInForm({ client, methods, labels = DEFAULT_AUTH_LABELS, classes, locale, next, signInPath, signUpLink, initialError = false, codeDoor, }) {
    const c = merge(classes);
    const [step, setStep] = useState(codeDoor?.first ? "code" : "start");
    const [linkedCode, setLinkedCode] = useState();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [useBackup, setUseBackup] = useState(false);
    const [trustDevice, setTrustDevice] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(initialError ? labels.errors.generic : null);
    const [unverified, setUnverified] = useState(false);
    // The link's email also carries a code when the server says so (./sign-in-code).
    const [codeSent, setCodeSent] = useState(false);
    const [signInCode, setSignInCode] = useState("");
    const [recovery, setRecovery] = useState(null);
    useEffect(() => {
        const query = new URLSearchParams(window.location.search);
        const token = query.get("token");
        // A personal link (`?code=…`): the code door opens with it and signs in
        // once. The code leaves the address bar, as a reset token does.
        const linked = codeDoor?.param ? query.get(codeDoor.param) : null;
        if (linked) {
            setLinkedCode(codeDoor?.uppercase ? linked.trim().toUpperCase() : linked.trim());
            setStep("code");
            const url = new URL(window.location.href);
            url.searchParams.delete(codeDoor.param);
            window.history.replaceState(null, "", url.pathname + url.search + url.hash);
        }
        const linkError = query.get("method") === "magic-link" && query.has("error");
        if (linkError)
            setError(labels.errors.SESSION_EXPIRED);
        if (!token && query.get("twoFactor") === "1")
            setStep("twoFactor");
        if (token || (!linkError && query.get("error") === "INVALID_TOKEN")) {
            setRecovery({ token: token || undefined, invalid: !token });
            // Keep bearer reset credentials out of the address bar, referrers and history.
            const url = new URL(window.location.href);
            url.searchParams.delete("token");
            url.searchParams.delete("error");
            window.history.replaceState(null, "", url.pathname + url.search + url.hash);
        }
    }, [labels, codeDoor?.param, codeDoor?.uppercase]);
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
        const { data, error: e } = await client.signIn.magicLink({
            email,
            callbackURL: next,
            errorCallbackURL: `${signInPath}?method=magic-link&next=${encodeURIComponent(next)}`,
        });
        if (e)
            return fail(e);
        setCodeSent(Boolean(client.signIn.emailOtp &&
            data &&
            typeof data === "object" &&
            "code" in data &&
            data.code === true));
        setSignInCode("");
        setStep("linkSent");
        setBusy(false);
    }
    async function withCode(event) {
        event.preventDefault();
        if (!client.signIn.emailOtp)
            return;
        setBusy(true);
        setError(null);
        const { data, error: e } = await client.signIn.emailOtp({
            email,
            otp: signInCode.replace(/\s+/g, ""),
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
    async function withPasskey() {
        setBusy(true);
        setError(null);
        const result = await client.signIn.passkey();
        if (result?.error)
            return fail(result.error);
        if (result &&
            "data" in result &&
            result.data &&
            typeof result.data === "object" &&
            "twoFactorRedirect" in result.data &&
            result.data.twoFactorRedirect) {
            setStep("twoFactor");
            setBusy(false);
            return;
        }
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
    if (recovery) {
        return (_jsx(PasswordRecoveryForm, { client: client, methods: methods, labels: labels, classes: classes, signInPath: signInPath, next: next, initialEmail: email, token: recovery.token, invalidToken: recovery.invalid, onBack: () => {
                setRecovery(null);
                setError(null);
                setPassword("");
                setStep("start");
            } }));
    }
    if (step === "code" && codeDoor) {
        return (_jsx(CodeSignIn, { client: client, door: codeDoor, labels: labels, classes: c, onDone: done, onBack: () => {
                setError(null);
                setStep("start");
            }, initialCode: linkedCode }));
    }
    if (step === "lightning" && client.lightning) {
        return (_jsx(LightningLogin, { client: client.lightning, labels: labels, classes: c, purpose: "sign-in", onDone: done, onTwoFactor: () => setStep("twoFactor"), onBack: () => setStep("start") }));
    }
    if (step === "linkSent") {
        return (_jsxs("div", { className: c.stack, children: [_jsx("p", { className: c.notice, role: "status", children: fill(labels.checkInbox, { email }) }), codeSent && (_jsxs("form", { onSubmit: withCode, className: c.stack, children: [_jsxs("div", { className: c.field, children: [_jsx("label", { htmlFor: "acct-sign-in-code", className: c.label, children: labels.codePrompt ?? DEFAULT_AUTH_LABELS.codePrompt }), _jsx("input", { id: "acct-sign-in-code", className: c.input, inputMode: "numeric", autoComplete: "one-time-code", pattern: "[0-9 ]*", maxLength: 7, value: signInCode, onChange: (e) => setSignInCode(e.target.value), required: true })] }), _jsx(ErrorLine, { message: error, className: c.error }), _jsx("button", { type: "submit", className: c.button, disabled: busy, children: unbroken(labels.signInWithCode ?? DEFAULT_AUTH_LABELS.signInWithCode) })] })), _jsx("button", { type: "button", className: c.buttonQuiet, onClick: () => {
                        setError(null);
                        setStep("start");
                    }, children: unbroken(labels.back) })] }));
    }
    if (step === "twoFactor") {
        return (_jsxs("form", { onSubmit: withSecondFactor, className: c.stack, children: [_jsx("p", { className: c.hint, children: useBackup ? labels.backupPrompt : labels.totpPrompt }), _jsxs("div", { className: c.field, children: [_jsx("label", { htmlFor: "acct-code", className: c.label, children: useBackup ? labels.backupCode : labels.totpCode }), _jsx("input", { id: "acct-code", className: c.input, inputMode: useBackup ? "text" : "numeric", autoComplete: "one-time-code", value: code, onChange: (e) => setCode(e.target.value), required: true })] }), _jsxs("label", { className: c.check, children: [_jsx("input", { type: "checkbox", checked: trustDevice, onChange: (e) => setTrustDevice(e.target.checked) }), labels.trustDevice] }), _jsx(ErrorLine, { message: error, className: c.error }), _jsx("button", { type: "submit", className: c.button, disabled: busy, children: unbroken(labels.verify) }), _jsx("button", { type: "button", className: c.buttonQuiet, onClick: () => setUseBackup(!useBackup), children: unbroken(useBackup ? labels.useTotp : labels.useBackup) })] }));
    }
    return (_jsxs("div", { className: c.stack, children: [_jsx(OidcButtons, { client: client, methods: methods, labels: labels, classes: classes, callbackURL: next, errorCallbackURL: `${signInPath}?error=oidc&next=${encodeURIComponent(next)}`, onError: fail, locale: locale }), methods.passkey && (_jsx("button", { type: "button", className: c.buttonQuiet, onClick: withPasskey, disabled: busy, children: unbroken(labels.withPasskey) })), methods.lightning && client.lightning && (_jsx("button", { type: "button", className: c.buttonQuiet, onClick: () => {
                    setError(null);
                    setStep("lightning");
                }, disabled: busy, children: unbroken(lightningWords(labels).withLightning) })), (hasOidc(methods) || methods.passkey || methods.lightning) && (_jsx(Divider, { label: labels.orEmail, className: c.divider })), _jsxs("form", { onSubmit: withPassword, className: c.stack, children: [_jsxs("div", { className: c.field, children: [_jsx("label", { htmlFor: "acct-email", className: c.label, children: labels.email }), _jsx("input", { id: "acct-email", type: "email", className: c.input, autoComplete: "username webauthn", value: email, onChange: (e) => setEmail(e.target.value), required: true })] }), _jsxs("div", { className: c.field, children: [_jsx("label", { htmlFor: "acct-password", className: c.label, children: labels.password }), _jsx("input", { id: "acct-password", type: "password", className: c.input, autoComplete: "current-password", value: password, onChange: (e) => setPassword(e.target.value), required: true })] }), _jsx(ErrorLine, { message: error, className: c.error }), unverified && methods.verifyEmail && (_jsx("button", { type: "button", className: c.buttonQuiet, onClick: resendVerification, disabled: busy, children: unbroken(labels.resendVerification) })), _jsx("button", { type: "submit", className: c.button, disabled: busy, children: unbroken(labels.signIn) }), methods.magicLink && (_jsx("button", { type: "button", className: c.textAction, onClick: withLink, disabled: busy, children: unbroken(labels.withLink) })), methods.passwordReset &&
                        client.requestPasswordReset &&
                        client.resetPassword && (_jsx("button", { type: "button", className: c.textAction, disabled: busy, onClick: () => setRecovery({}), children: unbroken((labels.recovery ?? DEFAULT_AUTH_LABELS.recovery).forgot) }))] }), codeDoor && (_jsx("button", { type: "button", className: c.buttonQuiet, onClick: () => {
                    setError(null);
                    setStep("code");
                }, disabled: busy, children: unbroken(codeDoor.open) })), _jsxs("p", { className: c.hint, children: [labels.noAccount, " ", signUpLink] })] }));
}
export { PasswordRecoveryForm } from "./recovery.js";
export { uiLocalesFor } from "./ui-locales.js";
/**
 * A new account in one step. No real name is asked for — a display name is
 * optional and may be anything. A passkey is added from the account page once
 * the account exists.
 */
export function SignUpForm({ client, methods, labels = DEFAULT_AUTH_LABELS, classes, locale, next, signUpPath, signInPath = signUpPath.endsWith("/sign-up")
    ? signUpPath.replace(/sign-up$/, "sign-in")
    : "/sign-in", signInLink, }) {
    const c = merge(classes);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [sent, setSent] = useState(null);
    const [lightning, setLightning] = useState(false);
    const fail = (e) => {
        setError(authErrorText(labels, e));
        setBusy(false);
    };
    async function submit(event) {
        event.preventDefault();
        setError(null);
        setBusy(true);
        const { error: e } = await client.signUp.email({
            // No name is asked for: an account starts nameless and the product
            // shows the address until the person chooses one.
            name: "",
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
            callbackURL: next,
            errorCallbackURL: `${signInPath}?method=magic-link&next=${encodeURIComponent(next)}`,
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
    if (lightning && client.lightning) {
        return (_jsx(LightningLogin, { client: client.lightning, labels: labels, classes: c, purpose: "sign-in", onDone: () => window.location.assign(next), 
            // An existing account with a second factor finishes on sign-in.
            onTwoFactor: () => window.location.assign(`${signInPath}?twoFactor=1&next=${encodeURIComponent(next)}`), onBack: () => setLightning(false) }));
    }
    return (_jsxs("div", { className: c.stack, children: [_jsx(OidcButtons, { client: client, methods: methods, labels: labels, classes: classes, callbackURL: next, errorCallbackURL: `${signInPath}?error=oidc&next=${encodeURIComponent(next)}`, onError: fail, locale: locale }), methods.lightning && client.lightning && (_jsx("button", { type: "button", className: c.buttonQuiet, onClick: () => setLightning(true), disabled: busy, children: unbroken(lightningWords(labels).withLightning) })), (hasOidc(methods) || methods.lightning) && (_jsx(Divider, { label: labels.orEmail, className: c.divider })), _jsxs("form", { onSubmit: submit, className: c.stack, children: [_jsxs("div", { className: c.field, children: [_jsx("label", { htmlFor: "acct-email", className: c.label, children: labels.email }), _jsx("input", { id: "acct-email", type: "email", className: c.input, autoComplete: "email", value: email, onChange: (e) => setEmail(e.target.value), required: true })] }), _jsxs("div", { className: c.field, children: [_jsx("label", { htmlFor: "acct-password", className: c.label, children: labels.password }), _jsx(PasswordField, { id: "acct-password", value: password, onChange: setPassword, classes: c, labels: labels })] }), _jsx(ErrorLine, { message: error, className: c.error }), _jsx("button", { type: "submit", className: c.button, disabled: busy, children: unbroken(labels.createAccount) }), methods.magicLink && (_jsx("button", { type: "button", className: c.buttonQuiet, onClick: withLink, disabled: busy, children: unbroken(labels.signUpWithLink) }))] }), _jsxs("p", { className: c.hint, children: [labels.haveAccount, " ", signInLink] })] }));
}
function Section({ title, id, classes, children, }) {
    return (_jsxs("section", { className: classes.section, "aria-labelledby": id, children: [_jsx("h2", { id: id, className: classes.sectionTitle, children: title }), children] }));
}
/** Everything about one's own account, and the way out of it. */
export function AccountPanel({ client, methods, labels = DEFAULT_AUTH_LABELS, classes, user, linked, accountPath, homePath, deletion, ownProfile = false, }) {
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
        {
            id: "bitbaum-signin",
            label: signinButtonLabel(labels, signinProvidersBeside(methods.signinProviders, {
                github: methods.github,
            })),
            on: methods.signin,
        },
        { id: "orangecat", label: labels.withOrangecat, on: methods.orangecat },
        {
            id: "github",
            label: labels.withGithub ?? DEFAULT_AUTH_LABELS.withGithub,
            on: Boolean(methods.github),
        },
    ];
    const methodName = (id) => id === "credential"
        ? a.methodPassword
        : id === "lightning"
            ? lightningWords(labels).name
            : (oidc.find((o) => o.id === id)?.label ?? id);
    const [linkingLightning, setLinkingLightning] = useState(false);
    return (_jsxs("div", { className: c.stack, children: [_jsx(ErrorLine, { message: error, className: c.error }), !ownProfile && (_jsx(Section, { title: a.profile, id: "acct-profile", classes: c, children: _jsxs("form", { onSubmit: saveName, className: c.stack, children: [_jsxs("div", { className: c.field, children: [_jsx("label", { htmlFor: "acct-display-name", className: c.label, children: labels.displayName }), _jsx("input", { id: "acct-display-name", className: c.input, maxLength: 80, value: name, onChange: (e) => {
                                        setName(e.target.value);
                                        setSaved(false);
                                    } })] }), _jsxs("dl", { className: c.hint, children: [_jsxs("div", { children: [_jsxs("dt", { style: { display: "inline" }, children: [labels.email, ": "] }), _jsxs("dd", { style: { display: "inline", margin: 0 }, children: [user.email ?? a.noEmail, user.email && !user.emailVerified && ` (${a.unverified})`] })] }), _jsxs("div", { children: [_jsxs("dt", { style: { display: "inline" }, children: [a.role, ": "] }), _jsx("dd", { style: { display: "inline", margin: 0 }, children: a.roles[user.role] ?? user.role })] })] }), _jsxs("div", { children: [_jsx("button", { type: "submit", className: c.button, disabled: busy, children: unbroken(a.save) }), " ", saved && _jsx("span", { role: "status", children: a.saved })] })] }) })), _jsxs(Section, { title: a.methods, id: "acct-methods", classes: c, children: [_jsx("ul", { className: c.hint, children: linked.map((id) => (_jsx("li", { children: methodName(id) }, id))) }), _jsxs("div", { className: c.stack, children: [oidc
                                .filter((o) => o.on && !linked.includes(o.id))
                                .map((o) => (_jsx("button", { type: "button", className: c.buttonQuiet, onClick: () => link(o.id), disabled: busy, children: unbroken(fill(a.link, { method: o.label })) }, o.id))), methods.lightning &&
                                client.lightning &&
                                !linked.includes("lightning") &&
                                (linkingLightning ? (_jsx(LightningLogin, { client: client.lightning, labels: labels, classes: c, purpose: "link", onDone: () => window.location.reload(), onBack: () => setLinkingLightning(false) })) : (_jsx("button", { type: "button", className: c.buttonQuiet, onClick: () => setLinkingLightning(true), disabled: busy, children: unbroken(fill(a.link, { method: lightningWords(labels).name })) })))] })] }), _jsxs(Section, { title: a.passkeys, id: "acct-passkeys", classes: c, children: [_jsx("p", { className: c.hint, children: a.passkeysLede }), passkeys && passkeys.length > 0 && (_jsx("ul", { className: c.stack, children: passkeys.map((p) => (_jsxs("li", { children: [_jsx("span", { children: p.name || a.passkeyDefaultName }), " ", _jsx("button", { type: "button", className: c.buttonQuiet, onClick: () => removePasskey(p.id), disabled: busy, children: unbroken(a.remove) })] }, p.id))) })), _jsx("button", { type: "button", className: c.button, onClick: addPasskey, disabled: busy, children: unbroken(a.addPasskey) })] }), _jsxs(Section, { title: a.twoFactor, id: "acct-two-factor", classes: c, children: [_jsx("p", { className: c.hint, children: twoFactor ? a.twoFactorOn : a.twoFactorOff }), _jsxs("div", { className: c.field, children: [_jsx("label", { htmlFor: "acct-current-password", className: c.label, children: a.currentPassword }), _jsx("input", { id: "acct-current-password", type: "password", className: c.input, autoComplete: "current-password", value: password, onChange: (e) => setPassword(e.target.value), "aria-describedby": "acct-current-password-hint" }), _jsx("p", { id: "acct-current-password-hint", className: c.hint, children: a.currentPasswordHint })] }), totp ? (_jsxs("form", { onSubmit: confirmTwoFactor, className: c.stack, children: [_jsx("p", { className: c.notice, children: a.scan }), _jsx("a", { href: totp.uri, className: c.link, children: a.openAuthenticator }), _jsx("p", { className: c.hint, children: a.backupCodes }), _jsx("ul", { className: c.hint, children: totp.backupCodes.map((backup) => (_jsx("li", { children: _jsx("code", { children: backup }) }, backup))) }), _jsxs("div", { className: c.field, children: [_jsx("label", { htmlFor: "acct-totp", className: c.label, children: labels.totpCode }), _jsx("input", { id: "acct-totp", className: c.input, inputMode: "numeric", autoComplete: "one-time-code", value: code, onChange: (e) => setCode(e.target.value), required: true })] }), _jsx("button", { type: "submit", className: c.button, disabled: busy, children: unbroken(a.turnOn) })] })) : twoFactor ? (_jsx("button", { type: "button", className: c.buttonQuiet, onClick: stopTwoFactor, disabled: busy, children: unbroken(a.turnOff) })) : (_jsx("button", { type: "button", className: c.button, onClick: startTwoFactor, disabled: busy, children: unbroken(a.setUp) }))] }), _jsx(Section, { title: a.leave, id: "acct-leave", classes: c, children: _jsxs("div", { className: c.stack, children: [_jsx("button", { type: "button", className: c.buttonQuiet, onClick: signOut, children: unbroken(a.signOut) }), deletion ?? (_jsxs(_Fragment, { children: [_jsxs("div", { className: c.field, children: [_jsx("label", { htmlFor: "acct-confirm-delete", className: c.label, children: fill(a.deleteConfirm, { word: a.deleteWord }) }), _jsx("input", { id: "acct-confirm-delete", className: c.input, value: confirmDelete, onChange: (e) => setConfirmDelete(e.target.value) })] }), _jsx("button", { type: "button", className: c.buttonQuiet, onClick: deleteAccount, disabled: busy ||
                                        confirmDelete.trim().toLowerCase() !==
                                            a.deleteWord.toLowerCase(), children: unbroken(a.delete) })] }))] }) })] }));
}
export { DEFAULT_AUTH_LABELS, authErrorText, fill, };
/**
 * Claiming an identity the product provisioned: a code or a claim link, an
 * email and a first password, sent to AccountKit's `/provision/claim` (the
 * server's `provisioning`). The server decides everything that matters: the
 * proof is taken once; an address already in use joins only on its own
 * password; a confirmed address of the identity must match. This form says
 * what happened in AccountKit's words and moves on: signed in, asked to
 * confirm the address, or asked to sign in for a second factor.
 */
export function ClaimForm({ client, labels = DEFAULT_AUTH_LABELS, classes, next, signInPath, signInLink, proof, }) {
    const c = merge(classes);
    const w = claimWords(labels);
    const [code, setCode] = useState(proof.kind === "code" ? (proof.initial ?? "") : "");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [outcome, setOutcome] = useState(null);
    const refusals = {
        CLAIM_INVALID: w.invalid,
        CLAIM_ALREADY_CLAIMED: w.alreadyClaimed,
        CLAIM_EMAIL_TAKEN: w.emailTaken,
        CLAIM_EMAIL_NEEDS_RECOVERY: w.emailNeedsRecovery,
        CLAIM_LINK_PASSWORD_MISMATCH: w.linkPasswordMismatch,
        CLAIM_VERIFIED_EMAIL_MISMATCH: w.verifiedEmailMismatch,
    };
    async function submit(event) {
        event.preventDefault();
        const credential = proof.kind === "given"
            ? proof.credential
            : `${proof.prefix ?? ""}${code.trim()}`;
        setBusy(true);
        setError(null);
        const answer = await post(client, "/provision/claim", {
            credential,
            email: email.trim(),
            password,
            callbackURL: next,
        });
        if (answer.ok) {
            const status = String(answer.data.status ?? "signed_in");
            if (status === "signed_in")
                return window.location.assign(next);
            setOutcome(status === "verify_email" ? "verify_email" : "sign_in");
            setBusy(false);
            return;
        }
        setBusy(false);
        setError(refusals[answer.code] ??
            (answer.status === 429
                ? labels.errors.rateLimited
                : answer.status === 400
                    ? w.emailInvalid
                    : answer.status === 0
                        ? labels.errors.unavailable
                        : labels.errors.generic));
    }
    if (outcome === "verify_email") {
        return (_jsxs("div", { className: c.stack, children: [_jsx("p", { className: c.notice, role: "status", children: fill(w.verifyEmail, { email: email.trim() }) }), _jsx("p", { className: c.hint, children: signInLink })] }));
    }
    if (outcome === "sign_in") {
        return (_jsxs("div", { className: c.stack, children: [_jsx("p", { className: c.notice, role: "status", children: w.signIn }), _jsx("button", { type: "button", className: c.button, onClick: () => window.location.assign(signInPath), children: unbroken(labels.signIn) })] }));
    }
    return (_jsxs("form", { onSubmit: submit, className: c.stack, children: [proof.kind === "code" && (_jsxs("div", { className: c.field, children: [_jsx("label", { htmlFor: "acct-claim-code", className: c.label, children: proof.label }), _jsx("input", { id: "acct-claim-code", className: c.input, autoComplete: "off", autoCapitalize: proof.uppercase ? "characters" : undefined, spellCheck: false, placeholder: proof.placeholder, value: code, onChange: (e) => setCode(proof.uppercase ? e.target.value.toUpperCase() : e.target.value), required: true }), proof.hint && _jsx("p", { className: c.hint, children: proof.hint })] })), _jsxs("div", { className: c.field, children: [_jsx("label", { htmlFor: "acct-claim-email", className: c.label, children: labels.email }), _jsx("input", { id: "acct-claim-email", type: "email", className: c.input, autoComplete: "email", value: email, onChange: (e) => setEmail(e.target.value), required: true })] }), _jsxs("div", { className: c.field, children: [_jsx("label", { htmlFor: "acct-password", className: c.label, children: labels.password }), _jsx(PasswordField, { id: "acct-password", value: password, onChange: setPassword, classes: c, labels: labels })] }), _jsx(ErrorLine, { message: error, className: c.error }), _jsx("button", { type: "submit", className: c.button, disabled: busy, children: unbroken(w.submit) }), _jsxs("p", { className: c.hint, children: [labels.haveAccount, " ", signInLink] })] }));
}
//# sourceMappingURL=react.js.map