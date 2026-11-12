import { type AccountMenuProps } from "./AccountMenu.js";
import type { AccountUser } from "./identity.js";
/** Where "Sign in" goes, and what it says. */
export type AccountSignIn = {
    href: string;
    /** Defaults to `labels.signIn`, then "Sign in". */
    label?: string;
};
export type AccountControlProps = {
    /**
     * What is known about the session: `"loading"` while it is being asked,
     * `null` when nobody is signed in, the person when someone is.
     */
    state: "loading" | null | AccountUser;
    signIn: AccountSignIn;
} & Omit<AccountMenuProps, "user">;
/**
 * The signed-out state as HTML, without React: byte for byte what
 * `<AccountControl state={null} signIn={{ href, label }} />` renders. A static
 * page prints it in the header slot, then mounts the control over it once the
 * session is known. `href` and `label` are escaped.
 */
export declare function accountSignInHtml({ href, label }: AccountSignIn): string;
/**
 * The one account control for a header, in all three states, so no product
 * writes its own signed-out corner:
 *  - `"loading"`: an empty box exactly the trigger's size, hidden from
 *    assistive technology and not focusable, so nothing moves when the answer
 *    arrives;
 *  - `null`: one "Sign in" link, the trigger's height, in the same slot;
 *  - a person: `AccountMenu`, unchanged.
 */
export declare function AccountControl({ state, signIn, ...menu }: AccountControlProps): import("react").JSX.Element;
//# sourceMappingURL=AccountControl.d.ts.map