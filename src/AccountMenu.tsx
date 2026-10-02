"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  displayNameFor,
  initialsFor,
  nextMenuIndex,
  secondaryLineFor,
  type AccountUser,
} from "./identity.js";

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
export type AccountGroup = { id: string; items: AccountItem[] };

export type AccountMenuLabels = {
  /** Accessible name of the trigger; "{name}" is replaced. */
  trigger: string;
  menu: string;
  signOut: string;
  signingOut: string;
  signOutFailed: string;
};

const DEFAULT_LABELS: AccountMenuLabels = {
  trigger: "Account: {name}",
  menu: "Account",
  signOut: "Sign out",
  signingOut: "Signing out…",
  signOutFailed: "Sign-out did not complete. Try again.",
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

function defaultLink(props: RenderLinkProps): ReactNode {
  return <a {...props} />;
}

function isLink(item: AccountItem): item is AccountLinkItem {
  return "href" in item;
}

/** A person outline — drawn when there is neither a photo nor a name. */
function PersonGlyph() {
  return (
    <svg
      className="acct-glyph"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
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
export function AccountMenu({
  user,
  onSignOut,
  groups = [],
  extra,
  renderLink = defaultLink,
  labels: labelOverrides,
  align = "end",
  className,
}: AccountMenuProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const [open, setOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const name = displayNameFor(user);
  const initials = initialsFor(user);
  const secondary = secondaryLineFor(user);
  const showImage = Boolean(user.image) && !imageFailed;

  // A new image URL deserves a fresh attempt.
  useEffect(() => setImageFailed(false), [user.image]);

  const items = useCallback(
    () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          '[role="menuitem"]:not([disabled])',
        ) ?? [],
      ),
    [],
  );

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // A click anywhere outside closes — a listener, not a full-page scrim, so
  // the click still reaches whatever it was aimed at.
  //
  // Escape is listened for on the DOCUMENT, not the panel. Opened with the
  // mouse, focus stays on the trigger, so a panel-only handler never sees the
  // key: the browser check caught Escape doing nothing after a click.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
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

  function focusAt(index: number) {
    const list = items();
    list[index]?.focus();
  }

  function openWithFocus(index: "first" | "last") {
    setOpen(true);
    setSignOutError(false);
    // After render: the panel does not exist yet.
    requestAnimationFrame(() => {
      const list = items();
      focusAt(index === "first" ? 0 : list.length - 1);
    });
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openWithFocus("first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openWithFocus("last");
    }
  }

  function onPanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Escape is handled by the document listener above, wherever focus is.
    if (event.key === "Tab") {
      close(false);
      return;
    }
    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "Home" ||
      event.key === "End"
    ) {
      event.preventDefault();
      const list = items();
      const current = list.indexOf(document.activeElement as HTMLElement);
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
    } catch {
      setSignOutError(true);
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className={["acct", className].filter(Boolean).join(" ")}
      data-align={align}
    >
      <button
        ref={triggerRef}
        type="button"
        className="acct-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={labels.trigger.replace("{name}", name)}
        title={name}
        onClick={() => {
          setOpen((v) => !v);
          setSignOutError(false);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        {showImage ? (
          <img
            className="acct-avatar"
            src={user.image ?? undefined}
            alt=""
            onError={() => setImageFailed(true)}
          />
        ) : initials ? (
          <span className="acct-initials" aria-hidden="true">
            {initials}
          </span>
        ) : (
          <PersonGlyph />
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          className="acct-panel"
          role="menu"
          aria-label={labels.menu}
          onKeyDown={onPanelKeyDown}
        >
          <div className="acct-identity">
            <p className="acct-name">{name}</p>
            {secondary && <p className="acct-secondary">{secondary}</p>}
          </div>

          {groups
            .filter((g) => g.items.length > 0)
            .map((group) => (
              <div key={group.id} className="acct-group" role="group">
                {group.items.map((item) =>
                  isLink(item) ? (
                    <Fragment key={item.id}>
                      {renderLink({
                        href: item.href,
                        className: "acct-row",
                        role: "menuitem",
                        tabIndex: -1,
                        onClick: () => close(false),
                        children: (
                          <>
                            {item.icon && (
                              <span className="acct-icon">{item.icon}</span>
                            )}
                            <span>{item.label}</span>
                          </>
                        ),
                      })}
                    </Fragment>
                  ) : (
                    <button
                      key={item.id}
                      type="button"
                      className="acct-row"
                      role="menuitem"
                      tabIndex={-1}
                      onClick={() => {
                        close(false);
                        void item.onSelect();
                      }}
                    >
                      {item.icon && (
                        <span className="acct-icon">{item.icon}</span>
                      )}
                      <span>{item.label}</span>
                    </button>
                  ),
                )}
              </div>
            ))}

          {extra && <div className="acct-group acct-extra">{extra}</div>}

          <div className="acct-group">
            <button
              type="button"
              className="acct-row acct-signout"
              role="menuitem"
              tabIndex={-1}
              disabled={signingOut}
              aria-busy={signingOut}
              onClick={() => void signOut()}
            >
              <span>{signingOut ? labels.signingOut : labels.signOut}</span>
            </button>
            {signOutError && (
              <p className="acct-error" role="alert">
                {labels.signOutFailed}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
