/**
 * Who is signed in, as the menu shows it — pure, so every rule is testable
 * without a browser.
 *
 * Two apps had already learned two different halves of this, and each was
 * missing the other's half:
 *
 *  - Loki: initials come from the NAME only. Built from an email local-part,
 *    "butaeff" becomes "B" and tells the person nothing they didn't know.
 *  - OrangeCat: a display name is NEVER reconstructed from the email address.
 *    Its old chain ended in the local-part titlecased, so
 *    `firstname.lastname@…` came out as "Firstname Lastname" — a real name
 *    nobody typed, rebuilt from an address the person never chose to display,
 *    on an account that may have chosen a pseudonym on purpose.
 *
 * Loki itself still fell back to the email local-part for its name. This
 * module takes OrangeCat's rule, so adopting it fixes that too.
 */
export type AccountUser = {
    /** What the person chose to be called. */
    name?: string | null;
    /** Their handle, shown as @handle — e.g. an OrangeCat username. */
    handle?: string | null;
    /** Shown to the signed-in person as their own address; never used to
     *  invent a name or initials. */
    email?: string | null;
    /** Avatar URL. A broken image falls back to initials, then to a glyph. */
    image?: string | null;
};
/** Shown when the person has no name and no handle. Not their email. */
export declare const PLACEHOLDER_NAME = "Account";
/**
 * The name the menu shows: name, else @handle, else a placeholder.
 * Never the email, never anything derived from it.
 */
export declare function displayNameFor(user: AccountUser): string;
/**
 * Up to two initials from the person's NAME, or null — in which case the
 * trigger draws a person glyph rather than a letter that means nothing.
 */
export declare function initialsFor(user: AccountUser): string | null;
/** The identity line under the name: @handle when the name is shown, else the email. */
export declare function secondaryLineFor(user: AccountUser): string | null;
/**
 * Where keyboard focus goes next among `count` menu items. Arrows wrap;
 * Home and End jump. Pure so the wrap-around is pinned by a test — an
 * off-by-one here strands the keyboard on the last row.
 */
export declare function nextMenuIndex(current: number, key: "ArrowDown" | "ArrowUp" | "Home" | "End", count: number): number;
//# sourceMappingURL=identity.d.ts.map