"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, } from "react";
import { displayNameFor, initialsFor, nextMenuIndex, secondaryLineFor, } from "./identity.js";
export const DEFAULT_LABELS = {
    trigger: "Account: {name}",
    menu: "Account",
    signOut: "Sign out",
    signingOut: "Signing out…",
    signOutFailed: "Sign-out did not complete. Try again.",
    switchAccount: "Switch account",
    switching: "Switching…",
    switchFailed: "The switch did not complete. Try again.",
    waiting: "{count} waiting",
    waitingElsewhere: "something is waiting in another account",
    signIn: "Sign in",
};
// A layout effect places the panel before it is painted; on the server there
// is nothing to place, and React 18 warns about useLayoutEffect there.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
/** How far an open panel keeps from the screen's edge when it has to move. */
const EDGE_GAP = 16;
/**
 * Keep an open panel on screen. CSS pins it to the trigger's edge, which only
 * fits while the trigger is the last control in its row; where it is not (a
 * menu button after it), the panel ran off the screen. CSS cannot know where
 * the trigger sits in its row, so the panel is measured and, only if it
 * crosses an edge, moved back inside by `--acct-shift`. A panel that already
 * fits is not touched, so it looks exactly as it always did.
 *
 * The move is made in layout, on the edge the panel is pinned by, not with a
 * transform. Moved by `translate`, the panel sat on screen while the page
 * still scrolled sideways by the distance it had moved: seen in CI on
 * Chromium 156 (186px and 242px at 320 and 390 wide), not on Chromium 153.
 * A box that is laid out inside the screen cannot do that in any browser.
 * `--acct-shift` is therefore the offset of the pinned edge: the distance to
 * move right when that edge is the left one, its negative when it is the
 * right one (which edge it is depends on `align` and the text direction).
 */
function placePanel(panel) {
    panel.style.removeProperty("--acct-shift");
    const viewport = document.documentElement.clientWidth || window.innerWidth;
    const { left, right, width } = panel.getBoundingClientRect();
    const gap = Math.max(0, Math.min(EDGE_GAP, (viewport - width) / 2));
    let shift = 0;
    if (right > viewport)
        shift = viewport - gap - right;
    if (left + shift < 0)
        shift = gap - left;
    if (shift === 0)
        return;
    const start = panel.closest(".acct")?.getAttribute("data-align") === "start";
    const rtl = getComputedStyle(panel).direction === "rtl";
    const pinnedLeft = start !== rtl;
    panel.style.setProperty("--acct-shift", `${pinnedLeft ? shift : -shift}px`);
}
/**
 * The row the menu sits in: the nearest ancestor laid out as a flex or grid
 * container (a header row), so a wrapper `<div>` around the menu is looked
 * through. Falls back to the parent element. At most a few levels up.
 */
function headerRowOf(root) {
    let node = root.parentElement;
    for (let depth = 0; node && depth < 4; depth++) {
        const display = getComputedStyle(node).display;
        if (/flex|grid/.test(display))
            return node;
        node = node.parentElement;
    }
    return root.parentElement;
}
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
/** The second line of another account: its note, then its handle. Never its email. */
function switchLineFor(target) {
    const handle = target.user.handle?.trim().replace(/^@/, "");
    // A handle that is already the display name is not said twice.
    const shownHandle = handle && displayNameFor(target.user) !== `@${handle}` ? `@${handle}` : "";
    const parts = [target.note?.trim(), shownHandle].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : null;
}
/** A whole positive count, or 0 for anything else an app might pass. */
function waitingCount(target) {
    const n = target.waiting;
    return typeof n === "number" && Number.isFinite(n) && n >= 1
        ? Math.floor(n)
        : 0;
}
/** What the count shows: the number, capped so the row never grows with it. */
function waitingText(count) {
    return count > 99 ? "99+" : String(count);
}
/** The small face on an account row: photo, else initials, else a glyph. */
function AccountFace({ user }) {
    const [failed, setFailed] = useState(false);
    const initials = initialsFor(user);
    return (_jsx("span", { className: "acct-face", "aria-hidden": "true", children: user.image && !failed ? (_jsx("img", { src: user.image, alt: "", onError: () => setFailed(true) })) : initials ? (initials) : (_jsx(PersonGlyph, {})) }));
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
export function AccountMenu({ user, onSignOut, groups = [], accounts = [], onSwitchAccount, extra, renderLink = defaultLink, labels: labelOverrides, align = "end", className, }) {
    const labels = { ...DEFAULT_LABELS, ...labelOverrides };
    const [open, setOpen] = useState(false);
    const [imageFailed, setImageFailed] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    const [signOutError, setSignOutError] = useState(false);
    const [switchingTo, setSwitchingTo] = useState(null);
    const [switchError, setSwitchError] = useState(false);
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
    // Placed on open, and again whenever the answer could change while it is
    // open: the window resizes, the panel changes size, or the header row
    // reflows (a font loads, a sibling grows, a control is added or removed).
    // A move without a resize is invisible to a ResizeObserver, so the row's
    // children are watched for being added or removed as well.
    useIsomorphicLayoutEffect(() => {
        const panel = panelRef.current;
        const root = rootRef.current;
        if (!open || !panel)
            return;
        placePanel(panel);
        const onResize = () => placePanel(panel);
        window.addEventListener("resize", onResize);
        const row = root ? headerRowOf(root) : null;
        let resizes;
        let mutations;
        if (typeof ResizeObserver === "function") {
            resizes = new ResizeObserver(onResize);
            resizes.observe(panel);
            if (row) {
                resizes.observe(row);
                for (const child of Array.from(row.children))
                    resizes.observe(child);
            }
        }
        if (row && typeof MutationObserver === "function") {
            mutations = new MutationObserver((records) => {
                for (const record of records) {
                    if (record.target !== row)
                        continue;
                    for (const node of Array.from(record.addedNodes)) {
                        if (node instanceof Element)
                            resizes?.observe(node);
                    }
                }
                placePanel(panel);
            });
            mutations.observe(row, { childList: true, subtree: true });
        }
        return () => {
            window.removeEventListener("resize", onResize);
            resizes?.disconnect();
            mutations?.disconnect();
        };
    }, [open]);
    function focusAt(index) {
        const list = items();
        list[index]?.focus();
    }
    function openWithFocus(index) {
        setOpen(true);
        setSignOutError(false);
        setSwitchError(false);
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
    async function switchTo(id) {
        if (!onSwitchAccount)
            return;
        setSwitchingTo(id);
        setSwitchError(false);
        try {
            await onSwitchAccount(id);
            // On success the app usually reloads; closing covers when it does not.
            setOpen(false);
        }
        catch {
            setSwitchError(true);
        }
        finally {
            setSwitchingTo(null);
        }
    }
    const switchable = onSwitchAccount ? accounts : [];
    const waitingElsewhere = switchable.some((t) => waitingCount(t) > 0);
    const triggerName = labels.trigger.replace("{name}", name);
    return (_jsxs("div", { ref: rootRef, className: ["acct", className].filter(Boolean).join(" "), "data-align": align, children: [_jsx("button", { ref: triggerRef, type: "button", className: "acct-trigger", "aria-haspopup": "menu", "aria-expanded": open, "aria-controls": open ? panelId : undefined, "aria-label": waitingElsewhere
                    ? `${triggerName}, ${labels.waitingElsewhere}`
                    : triggerName, title: name, onClick: () => {
                    setOpen((v) => !v);
                    setSignOutError(false);
                    setSwitchError(false);
                }, onKeyDown: onTriggerKeyDown, children: showImage ? (_jsx("img", { className: "acct-avatar", src: user.image ?? undefined, alt: "", onError: () => setImageFailed(true) })) : initials ? (_jsx("span", { className: "acct-initials", "aria-hidden": "true", children: initials })) : (_jsx(PersonGlyph, {})) }), waitingElsewhere && (_jsx("span", { className: "acct-trigger-dot", "aria-hidden": "true" })), open && (_jsxs("div", { ref: panelRef, id: panelId, className: "acct-panel", role: "menu", "aria-label": labels.menu, onKeyDown: onPanelKeyDown, children: [_jsxs("div", { className: "acct-identity", children: [_jsx("p", { className: "acct-name", children: name }), secondary && _jsx("p", { className: "acct-secondary", children: secondary })] }), switchable.length > 0 && (_jsxs("div", { className: "acct-group acct-accounts", role: "group", "aria-label": labels.switchAccount, children: [_jsx("p", { className: "acct-heading", children: labels.switchAccount }), switchable.map((target) => {
                                const line = switchingTo === target.id
                                    ? labels.switching
                                    : switchLineFor(target);
                                return (_jsxs("button", { type: "button", className: "acct-row acct-account", role: "menuitem", tabIndex: -1, disabled: switchingTo !== null, "aria-busy": switchingTo === target.id, onClick: () => void switchTo(target.id), children: [_jsx(AccountFace, { user: target.user }), _jsxs("span", { className: "acct-account-text", children: [_jsx("span", { className: "acct-account-name", children: displayNameFor(target.user) }), line && (_jsx("span", { className: "acct-account-line", children: line }))] }), waitingCount(target) > 0 && (_jsx("span", { className: "acct-waiting", "aria-label": labels.waiting.replace("{count}", String(waitingCount(target))), children: waitingText(waitingCount(target)) }))] }, target.id));
                            }), switchError && (_jsx("p", { className: "acct-error", role: "alert", children: labels.switchFailed }))] })), groups
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