"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Fragment, useCallback, useEffect, useId, useRef, useState, } from "react";
import { displayNameFor, initialsFor, nextMenuIndex, secondaryLineFor, } from "./identity.js";
const DEFAULT_LABELS = {
    trigger: "Account: {name}",
    menu: "Account",
    signOut: "Sign out",
    signingOut: "Signing out…",
    signOutFailed: "Sign-out did not complete. Try again.",
};
function defaultLink(props) {
    return _jsx("a", { ...props });
}
function isLink(item) {
    return "href" in item;
}
/** A person outline — drawn when there is neither a photo nor a name. */
function PersonGlyph() {
    return (_jsxs("svg", { className: "acct-glyph", viewBox: "0 0 24 24", width: "18", height: "18", "aria-hidden": "true", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("circle", { cx: "12", cy: "8", r: "4" }), _jsx("path", { d: "M4 21a8 8 0 0 1 16 0" })] }));
}
/**
 * The account menu: who is signed in, where to go, how to sign out.
 *
 * Identity, not navigation: the app's sidebar is for places in the product;
 * this is for the person. Nothing should appear in both.
 *
 * Behaviour that is shared and NOT configurable, because each item shipped
 * broken in at least one app:
 *  - a 44px trigger (Loki's was 36px, under the touch-target floor);
 *  - a photo that fails to load falls back to initials, then a glyph;
 *  - Escape closes and returns focus to the trigger; arrows, Home and End
 *    move between items; a click outside closes;
 *  - sign-out shows that it is happening, and says so when it fails.
 */
export function AccountMenu({ user, onSignOut, groups = [], extra, renderLink = defaultLink, labels: labelOverrides, align = "end", className, }) {
    const labels = { ...DEFAULT_LABELS, ...labelOverrides };
    const [open, setOpen] = useState(false);
    const [imageFailed, setImageFailed] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    const [signOutError, setSignOutError] = useState(false);
    const rootRef = useRef(null);
    const triggerRef = useRef(null);
    const panelRef = useRef(null);
    const panelId = useId();
    const name = displayNameFor(user);
    const initials = initialsFor(user);
    const secondary = secondaryLineFor(user);
    const showImage = Boolean(user.image) && !imageFailed;
    // A new image URL deserves a fresh attempt.
    useEffect(() => setImageFailed(false), [user.image]);
    const items = useCallback(() => Array.from(panelRef.current?.querySelectorAll('[role="menuitem"]:not([disabled])') ?? []), []);
    const close = useCallback((restoreFocus) => {
        setOpen(false);
        if (restoreFocus)
            triggerRef.current?.focus();
    }, []);
    // A click anywhere outside closes — a listener, not a full-page scrim, so
    // the click still reaches whatever it was aimed at.
    //
    // Escape is listened for on the DOCUMENT, not the panel. Opened with the
    // mouse, focus stays on the trigger, so a panel-only handler never sees the
    // key: the browser check caught Escape doing nothing after a click.
    useEffect(() => {
        if (!open)
            return;
        const onPointerDown = (event) => {
            if (!rootRef.current?.contains(event.target))
                close(false);
        };
        const onKeyDown = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                close(true);
            }
        };
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open, close]);
    function focusAt(index) {
        const list = items();
        list[index]?.focus();
    }
    function openWithFocus(index) {
        setOpen(true);
        setSignOutError(false);
        // After render: the panel does not exist yet.
        requestAnimationFrame(() => {
            const list = items();
            focusAt(index === "first" ? 0 : list.length - 1);
        });
    }
    function onTriggerKeyDown(event) {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            openWithFocus("first");
        }
        else if (event.key === "ArrowUp") {
            event.preventDefault();
            openWithFocus("last");
        }
    }
    function onPanelKeyDown(event) {
        // Escape is handled by the document listener above, wherever focus is.
        if (event.key === "Tab") {
            close(false);
            return;
        }
        if (event.key === "ArrowDown" ||
            event.key === "ArrowUp" ||
            event.key === "Home" ||
            event.key === "End") {
            event.preventDefault();
            const list = items();
            const current = list.indexOf(document.activeElement);
            focusAt(nextMenuIndex(current, event.key, list.length));
        }
    }
    async function signOut() {
        setSigningOut(true);
        setSignOutError(false);
        try {
            await onSignOut();
            // On success the app usually navigates away; closing covers the case
            // where it does not.
            setOpen(false);
        }
        catch {
            setSignOutError(true);
        }
        finally {
            setSigningOut(false);
        }
    }
    return (_jsxs("div", { ref: rootRef, className: ["acct", className].filter(Boolean).join(" "), "data-align": align, children: [_jsx("button", { ref: triggerRef, type: "button", className: "acct-trigger", "aria-haspopup": "menu", "aria-expanded": open, "aria-controls": open ? panelId : undefined, "aria-label": labels.trigger.replace("{name}", name), title: name, onClick: () => {
                    setOpen((v) => !v);
                    setSignOutError(false);
                }, onKeyDown: onTriggerKeyDown, children: showImage ? (_jsx("img", { className: "acct-avatar", src: user.image ?? undefined, alt: "", onError: () => setImageFailed(true) })) : initials ? (_jsx("span", { className: "acct-initials", "aria-hidden": "true", children: initials })) : (_jsx(PersonGlyph, {})) }), open && (_jsxs("div", { ref: panelRef, id: panelId, className: "acct-panel", role: "menu", "aria-label": labels.menu, onKeyDown: onPanelKeyDown, children: [_jsxs("div", { className: "acct-identity", children: [_jsx("p", { className: "acct-name", children: name }), secondary && _jsx("p", { className: "acct-secondary", children: secondary })] }), groups
                        .filter((g) => g.items.length > 0)
                        .map((group) => (_jsx("div", { className: "acct-group", role: "group", children: group.items.map((item) => isLink(item) ? (_jsx(Fragment, { children: renderLink({
                                href: item.href,
                                className: "acct-row",
                                role: "menuitem",
                                tabIndex: -1,
                                onClick: () => close(false),
                                children: (_jsxs(_Fragment, { children: [item.icon && (_jsx("span", { className: "acct-icon", children: item.icon })), _jsx("span", { children: item.label })] })),
                            }) }, item.id)) : (_jsxs("button", { type: "button", className: "acct-row", role: "menuitem", tabIndex: -1, onClick: () => {
                                close(false);
                                void item.onSelect();
                            }, children: [item.icon && (_jsx("span", { className: "acct-icon", children: item.icon })), _jsx("span", { children: item.label })] }, item.id))) }, group.id))), extra && _jsx("div", { className: "acct-group acct-extra", children: extra }), _jsxs("div", { className: "acct-group", children: [_jsx("button", { type: "button", className: "acct-row acct-signout", role: "menuitem", tabIndex: -1, disabled: signingOut, "aria-busy": signingOut, onClick: () => void signOut(), children: _jsx("span", { children: signingOut ? labels.signingOut : labels.signOut }) }), signOutError && (_jsx("p", { className: "acct-error", role: "alert", children: labels.signOutFailed }))] })] }))] }));
}
//# sourceMappingURL=AccountMenu.js.map