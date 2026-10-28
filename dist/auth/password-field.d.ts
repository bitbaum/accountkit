import { type AuthLabels } from "./labels.js";
import type { AuthClasses } from "./react.js";
type FieldClasses = Pick<AuthClasses, "input" | "inputWrap" | "reveal">;
/**
 * The one new-password field: a single input with a show/hide eye, the one
 * rule from ./password.ts, and nothing else. Sign-up and the reset form both
 * render it, so the two cannot drift apart.
 */
export declare function PasswordField({ id, value, onChange, classes, labels, disabled, autoComplete, }: {
    id: string;
    value: string;
    onChange: (password: string) => void;
    /** Class names for the input, its box and the eye; defaults to the package's own. */
    classes?: Partial<FieldClasses>;
    /** Only `passwordVisibility` is read; defaults to English. */
    labels?: Pick<AuthLabels, "passwordVisibility">;
    disabled?: boolean;
    autoComplete?: "new-password" | "current-password";
}): import("react").JSX.Element;
export {};
//# sourceMappingURL=password-field.d.ts.map