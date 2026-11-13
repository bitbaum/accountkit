"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
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

/**
 * At which widths a row is shown. `"always"` (the default) at every width;
 * `"narrow"` only below 768px, for a row that repeats a control the header
 * itself shows from that width up (a theme toggle, a search button). Hidden
 * by the package's stylesheet, in a media query, so the row is right on the
 * first paint and on the server: no width read in script, no flash.
 */
export type AccountRowShown = "always" | "narrow";

/** A place to go. Rendered through `renderLink` so a Next app keeps <Link>. */
export type AccountLinkItem = {
  id: string;
  label: string;
  href: string;
  icon?: ReactNode;
  shown?: AccountRowShown;
};

/** Something to do. Closes the menu, then runs. */
export type AccountActionItem = {
  id: string;
  label: string;
  onSelect: () => void | Promise<unknown>;
  icon?: ReactNode;
  shown?: AccountRowShown;
};

export type AccountItem = AccountLinkItem | AccountActionItem;

/**
 * Items are grouped; a divider separates groups. A group whose `shown` is
 * `"narrow"`, or whose every item's is, goes from 768px up with its divider.
 */
export type AccountGroup = {
  id: string;
  items: AccountItem[];
  shown?: AccountRowShown;
};

/** The class a narrow-only row or group carries; styles.css hides it wide. */
const NARROW_CLASS = "acct-narrow";

function rowClass(base: string, shown: AccountRowShown | undefined): string {
  return shown === "narrow" ? `${base} ${NARROW_CLASS}` : base;
}

/** A group goes wide when it says so, or when every one of its items does. */
export function groupShown(group: AccountGroup): AccountRowShown {
  if (group.shown === "narrow") return "narrow";
  return group.items.length > 0 &&
    group.items.every((item) => item.shown === "narrow")
    ? "narrow"
    : "always";
}

/**
 * Another account the signed-in person can become: a second identity, a work
 * account. The app decides which ones exist; the menu shows them and switches.
 */
export type AccountSwitchTarget = {
  id: string;
  user: AccountUser;
  /**
   * What this account is to the person, in a word or two ("Main account").
   * Leads the second line, so it is what survives a long handle.
   */
  note?: string;
  /**
   * How many things wait for the person in this account (unread messages,
   * notifications). Shown as a count on its row, and as a dot on the trigger
   * so it is known without opening the menu. Zero, absent or not a positive
   * number: nothing is shown.
   */
  waiting?: number;
};

export type AccountMenuLabels = {
  /** Accessible name of the trigger; "{name}" is replaced. */
  trigger: string;
  menu: string;
  signOut: string;
  signingOut: string;
  signOutFailed: string;
  /** Heading over the other accounts. */
  switchAccount: string;
  switching: string;
  switchFailed: string;
  /** Read out for an account's count; "{count}" is replaced. */
  waiting: string;
  /** Added to the trigger's name when another account has something waiting. */
  waitingElsewhere: string;
  /**
   * The signed-out link of `AccountControl`. Optional, so a full set of
   * labels written before it existed still type-checks.
   */
  signIn?: string;
};

export const DEFAULT_LABELS: Required<AccountMenuLabels> = {
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
   * The other accounts this person can become, listed under who is signed in.
   * Omit or pass none and the menu is unchanged. Their email is never shown:
   * the second line is the note and the handle.
   */
  accounts?: AccountSwitchTarget[];
  /**
   * Called with the account to become. May return a promise; while it is
   * pending the row says so, and if it rejects the menu stays open and says
   * the switch did not complete, exactly as sign-out does. On success the app
   * usually reloads as the other account.
   */
  onSwitchAccount?: (id: string) => void | Promise<unknown>;
  /**
   * Rows that are not menu items — a theme switch, a status line. Rendered
   * between the groups and Sign out, not navigable by arrow keys.
   */
  extra?: ReactNode;
  /**
   * At which widths `extra` is shown. `"narrow"` for a theme switch the
   * header itself carries from 768px up. Default `"always"`.
   */
  extraShown?: AccountRowShown;
  /** Defaults to a plain <a>. Pass `(p) => <Link {...p} />` in a Next app. */
  renderLink?: (props: RenderLinkProps) => ReactNode;
  labels?: Partial<AccountMenuLabels>;
  /** Which edge of the trigger the panel aligns to. */
  align?: "end" | "start";
  className?: string;
};

// A layout effect places the panel before it is painted; on the server there
// is nothing to place, and React 18 warns about useLayoutEffect there.
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

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
function placePanel(panel: HTMLElement) {
  panel.style.removeProperty("--acct-shift");
  const viewport = document.documentElement.clientWidth || window.innerWidth;
  const { left, right, width } = panel.getBoundingClientRect();
  const gap = Math.max(0, Math.min(EDGE_GAP, (viewport - width) / 2));
  let shift = 0;
  if (right > viewport) shift = viewport - gap - right;
  if (left + shift < 0) shift = gap - left;
  if (shift === 0) return;
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
function headerRowOf(root: HTMLElement): HTMLElement | null {
  let node = root.parentElement;
  for (let depth = 0; node && depth < 4; depth++) {
    const display = getComputedStyle(node).display;
    if (/flex|grid/.test(display)) return node;
    node = node.parentElement;
  }
  return root.parentElement;
}

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

/** The second line of another account: its note, then its handle. Never its email. */
function switchLineFor(target: AccountSwitchTarget): string | null {
  const handle = target.user.handle?.trim().replace(/^@/, "");
  // A handle that is already the display name is not said twice.
  const shownHandle =
    handle && displayNameFor(target.user) !== `@${handle}` ? `@${handle}` : "";
  const parts = [target.note?.trim(), shownHandle].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** A whole positive count, or 0 for anything else an app might pass. */
function waitingCount(target: AccountSwitchTarget): number {
  const n = target.waiting;
  return typeof n === "number" && Number.isFinite(n) && n >= 1
    ? Math.floor(n)
    : 0;
}

/** What the count shows: the number, capped so the row never grows with it. */
function waitingText(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/** The small face on an account row: photo, else initials, else a glyph. */
function AccountFace({ user }: { user: AccountUser }) {
  const [failed, setFailed] = useState(false);
  const initials = initialsFor(user);
  return (
    <span className="acct-face" aria-hidden="true">
      {user.image && !failed ? (
        <img src={user.image} alt="" onError={() => setFailed(true)} />
      ) : initials ? (
        initials
      ) : (
        <PersonGlyph />
      )}
    </span>
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
  accounts = [],
  onSwitchAccount,
  extra,
  extraShown = "always",
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
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState(false);
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

  // Only rows that are laid out: a `shown: "narrow"` row hidden by the
  // stylesheet at this width cannot take focus, so arrows step over it.
  const items = useCallback(
    () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          '[role="menuitem"]:not([disabled])',
        ) ?? [],
      ).filter((el) => el.getClientRects().length > 0),
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

  // Placed on open, and again whenever the answer could change while it is
  // open: the window resizes, the panel changes size, or the header row
  // reflows (a font loads, a sibling grows, a control is added or removed).
  // A move without a resize is invisible to a ResizeObserver, so the row's
  // children are watched for being added or removed as well.
  useIsomorphicLayoutEffect(() => {
    const panel = panelRef.current;
    const root = rootRef.current;
    if (!open || !panel) return;
    placePanel(panel);
    const onResize = () => placePanel(panel);
    window.addEventListener("resize", onResize);
    const row = root ? headerRowOf(root) : null;
    let resizes: ResizeObserver | undefined;
    let mutations: MutationObserver | undefined;
    if (typeof ResizeObserver === "function") {
      resizes = new ResizeObserver(onResize);
      resizes.observe(panel);
      if (row) {
        resizes.observe(row);
        for (const child of Array.from(row.children)) resizes.observe(child);
      }
    }
    if (row && typeof MutationObserver === "function") {
      mutations = new MutationObserver((records) => {
        for (const record of records) {
          if (record.target !== row) continue;
          for (const node of Array.from(record.addedNodes)) {
            if (node instanceof Element) resizes?.observe(node);
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

  function focusAt(index: number) {
    const list = items();
    list[index]?.focus();
  }

  function openWithFocus(index: "first" | "last") {
    setOpen(true);
    setSignOutError(false);
    setSwitchError(false);
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

  async function switchTo(id: string) {
    if (!onSwitchAccount) return;
    setSwitchingTo(id);
    setSwitchError(false);
    try {
      await onSwitchAccount(id);
      // On success the app usually reloads; closing covers when it does not.
      setOpen(false);
    } catch {
      setSwitchError(true);
    } finally {
      setSwitchingTo(null);
    }
  }

  const switchable = onSwitchAccount ? accounts : [];
  const waitingElsewhere = switchable.some((t) => waitingCount(t) > 0);
  const triggerName = labels.trigger.replace("{name}", name);

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
        aria-label={
          waitingElsewhere
            ? `${triggerName}, ${labels.waitingElsewhere}`
            : triggerName
        }
        title={name}
        onClick={() => {
          setOpen((v) => !v);
          setSignOutError(false);
          setSwitchError(false);
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
      {/* Beside the trigger, not in it: the trigger clips to keep a photo
          round, and would clip the dot with it. */}
      {waitingElsewhere && (
        <span className="acct-trigger-dot" aria-hidden="true" />
      )}

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

          {switchable.length > 0 && (
            <div
              className="acct-group acct-accounts"
              role="group"
              aria-label={labels.switchAccount}
            >
              <p className="acct-heading">{labels.switchAccount}</p>
              {switchable.map((target) => {
                const line =
                  switchingTo === target.id
                    ? labels.switching
                    : switchLineFor(target);
                return (
                  <button
                    key={target.id}
                    type="button"
                    className="acct-row acct-account"
                    role="menuitem"
                    tabIndex={-1}
                    disabled={switchingTo !== null}
                    aria-busy={switchingTo === target.id}
                    onClick={() => void switchTo(target.id)}
                  >
                    <AccountFace user={target.user} />
                    <span className="acct-account-text">
                      <span className="acct-account-name">
                        {displayNameFor(target.user)}
                      </span>
                      {line && (
                        <span className="acct-account-line">{line}</span>
                      )}
                    </span>
                    {waitingCount(target) > 0 && (
                      <span
                        className="acct-waiting"
                        aria-label={labels.waiting.replace(
                          "{count}",
                          String(waitingCount(target)),
                        )}
                      >
                        {waitingText(waitingCount(target))}
                      </span>
                    )}
                  </button>
                );
              })}
              {switchError && (
                <p className="acct-error" role="alert">
                  {labels.switchFailed}
                </p>
              )}
            </div>
          )}

          {groups
            .filter((g) => g.items.length > 0)
            .map((group) => (
              <div
                key={group.id}
                className={rowClass("acct-group", groupShown(group))}
                role="group"
              >
                {group.items.map((item) =>
                  isLink(item) ? (
                    <Fragment key={item.id}>
                      {renderLink({
                        href: item.href,
                        className: rowClass("acct-row", item.shown),
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
                      className={rowClass("acct-row", item.shown)}
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

          {extra && (
            <div className={rowClass("acct-group acct-extra", extraShown)}>
              {extra}
            </div>
          )}

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
