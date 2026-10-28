import { type AuthLabels } from "./labels.js";
import type { AuthClasses } from "./react.js";
/**
 * The one new-password field: a single input with a show/hide eye, the one
 * rule from ./password.ts, and nothing else. Sign-up and the reset form both
 * render it, so the two cannot drift apart.
 */
export declare function PasswordField({ id, value, onChange, classes, labels, disabled, }: {
    id: string;
    value: string;
    onChange: (password: string) => void;
    classes: Pick<AuthClasses, "input" | "inputWrap" | "reveal">;
    labels: AuthLabels;
    disabled?: boolean;
}): import("react").JSX.Element;
//# sourceMappingURL=password-field.d.ts.map