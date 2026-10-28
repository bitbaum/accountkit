"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { DEFAULT_AUTH_LABELS } from "./labels.js";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./password.js";
/** Styled by @bitbaum/accountkit/styles.css; a product with its own CSS passes `classes`. */
const DEFAULT_FIELD_CLASSES = {
    input: "acct-auth-input",
    inputWrap: "acct-auth-input-wrap",
    reveal: "acct-auth-reveal",
};
/** An eye, struck through while the password shows. Decorative: the button carries the words. */
function EyeIcon({ open }) {
    return (_jsxs("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [_jsx("path", { d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" }), _jsx("circle", { cx: "12", cy: "12", r: "3" }), open && _jsx("path", { d: "M3 3l18 18" })] }));
}
/**
 * The one new-password field: a single input with a show/hide eye, the one
 * rule from ./password.ts, and nothing else. Sign-up and the reset form both
 * render it, so the two cannot drift apart.
 */
export function PasswordField({ id, value, onChange, classes, labels, disabled = false, autoComplete = "new-password", }) {
    const c = { ...DEFAULT_FIELD_CLASSES, ...classes };
    const [visible, setVisible] = useState(false);
    const words = labels?.passwordVisibility ?? DEFAULT_AUTH_LABELS.passwordVisibility;
    return (_jsxs("div", { className: c.inputWrap, children: [_jsx("input", { id: id, type: visible ? "text" : "password", className: c.input, autoComplete: autoComplete, minLength: MIN_PASSWORD_LENGTH, maxLength: MAX_PASSWORD_LENGTH, value: value, disabled: disabled, onChange: (event) => onChange(event.target.value), required: true }), _jsx("button", { type: "button", className: c.reveal, "aria-controls": id, "aria-pressed": visible, "aria-label": visible ? words.hide : words.show, onClick: () => setVisible((v) => !v), children: _jsx(EyeIcon, { open: visible }) })] }));
}
//# sourceMappingURL=password-field.js.map