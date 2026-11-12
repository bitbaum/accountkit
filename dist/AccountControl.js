"use client";
import { jsx as _jsx } from "react/jsx-runtime";
import { AccountMenu, DEFAULT_LABELS, } from "./AccountMenu.js";
// React's own test for a script URL, so the static markup and the component
// refuse exactly the same hrefs.
const SCRIPT_URL = 
// eslint-disable-next-line no-control-regex
/^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
/** A sign-in link never runs script: a `javascript:` href becomes "#". */
function signInHref(href) {
    return SCRIPT_URL.test(href) ? "#" : href;
}
// The five characters React escapes in text and attribute values, escaped
// the way React does, so the two outputs are the same bytes.
const ESCAPES = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
};
function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}
/**
 * The signed-out state as HTML, without React: byte for byte what
 * `<AccountControl state={null} signIn={{ href, label }} />` renders. A static
 * page prints it in the header slot, then mounts the control over it once the
 * session is known. `href` and `label` are escaped.
 */
export function accountSignInHtml({ href, label }) {
    return `<a class="acct-signin" href="${escapeHtml(signInHref(href))}">${escapeHtml(label ?? DEFAULT_LABELS.signIn)}</a>`;
}
/**
 * The one account control for a header, in all three states, so no product
 * writes its own signed-out corner:
 *  - `"loading"`: an empty box exactly the trigger's size, hidden from
 *    assistive technology and not focusable, so nothing moves when the answer
 *    arrives;
 *  - `null`: one "Sign in" link, the trigger's height, in the same slot;
 *  - a person: `AccountMenu`, unchanged.
 */
export function AccountControl({ state, signIn, ...menu }) {
    if (state === "loading") {
        return (_jsx("span", { className: ["acct-pending", menu.className].filter(Boolean).join(" "), "aria-hidden": "true" }));
    }
    if (state === null) {
        return (_jsx("a", { className: ["acct-signin", menu.className].filter(Boolean).join(" "), href: signInHref(signIn.href), children: signIn.label ?? menu.labels?.signIn ?? DEFAULT_LABELS.signIn }));
    }
    return _jsx(AccountMenu, { user: state, ...menu });
}
//# sourceMappingURL=AccountControl.js.map