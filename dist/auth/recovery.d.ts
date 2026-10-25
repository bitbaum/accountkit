import { type AuthLabels } from "./labels.js";
import { type AuthClasses, type AuthClientLike } from "./react.js";
import type { SignInMethods } from "./methods.js";
/** The same request/reset journey on every product's existing sign-in page. */
export declare function PasswordRecoveryForm({ client, methods, signInPath, next, onBack, token: initialToken, initialEmail, invalidToken, labels, classes, }: {
    client: AuthClientLike;
    methods: SignInMethods;
    signInPath: string;
    next: string;
    onBack: () => void;
    token?: string;
    initialEmail?: string;
    invalidToken?: boolean;
    labels?: AuthLabels;
    classes?: Partial<AuthClasses>;
}): import("react").JSX.Element;
//# sourceMappingURL=recovery.d.ts.map