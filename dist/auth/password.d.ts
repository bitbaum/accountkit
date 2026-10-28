/**
 * The one password rule, for every product and every path: sign-up, reset,
 * change, server and form. Only that a password exists (and a ceiling so the
 * hash input stays bounded). No length floor beyond that, no character
 * classes, no strength meter, no hint text.
 */
export declare const MIN_PASSWORD_LENGTH = 1;
export declare const MAX_PASSWORD_LENGTH = 128;
/**
 * What is wrong with a password, if anything: the same answer in the browser
 * and on the server, for products that keep their own account code too.
 */
export declare function passwordProblem(password: unknown): "empty" | "too_long" | null;
//# sourceMappingURL=password.d.ts.map