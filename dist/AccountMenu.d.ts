import { type ReactNode } from "react";
import { type AccountUser } from "./identity.js";
/** A place to go. Rendered through `renderLink` so a Next app keeps <Link>. */
export type AccountLinkItem = {
    id: string;
    label: string;
    href: string;
    icon?: ReactNode;
};
/** Something to do. Closes the menu, then runs. */
export type AccountActionItem = {
    id: string;
    label: string;
    onSelect: () => void | Promise<unknown>;
    icon?: ReactNode;
};
export type AccountItem = AccountLinkItem | AccountActionItem;
/** Items are grouped; a divider separates groups. */
export type AccountGroup = {
    id: string;
    items: AccountItem[];
};
export type AccountMenuLabels = {
    /** Accessible name of the trigger; "{name}" is replaced. */
    trigger: string;
    menu: string;
    signOut: string;
    signingOut: string;
    signOutFailed: string;
};
export type RenderLinkProps = {
    href: string;
    className: string;
    role: "menuitem";
    tabIndex: -1;
    onClick: () => void;
    children: ReactNode;
};
export type AccountMenuProps = {
    user: AccountUser;
    /**
     * Called when the person signs out. May return a promise; while it is
     * pending the row says so, and if it rejects the menu stays open and says
     * the sign-out did not complete — a dead sign-out is the one failure this
     * menu must never hide.
     */
    onSignOut: () => void | Promise<unknown>;
    groups?: AccountGroup[];
    /**
     * Rows that are not menu items — a theme switch, a status line. Rendered
     * between the groups and Sign out, not navigable by arrow keys.
     */
    extra?: ReactNode;
    /** Defaults to a plain <a>. Pass `(p) => <Link {...p} />` in a Next app. */
    renderLink?: (props: RenderLinkProps) => ReactNode;
    labels?: Partial<AccountMenuLabels>;
    /** Which edge of the trigger the panel aligns to. */
    align?: "end" | "start";
    className?: string;
};
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
export declare function AccountMenu({ user, onSignOut, groups, extra, renderLink, labels: labelOverrides, align, className, }: AccountMenuProps): import("react").JSX.Element;
//# sourceMappingURL=AccountMenu.d.ts.map