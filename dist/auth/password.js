/**
 * The one password rule, for every product and every path: sign-up, reset,
 * change, server and form. Only that a password exists (and a ceiling so the
 * hash input stays bounded). No length floor beyond that, no character
 * classes, no strength meter, no hint text.
 */
export const MIN_PASSWORD_LENGTH = 1;
export const MAX_PASSWORD_LENGTH = 128;
/**
 * What is wrong with a password, if anything: the same answer in the browser
 * and on the server, for products that keep their own account code too.
 */
export function passwordProblem(password) {
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH)
        return "empty";
    return password.length > MAX_PASSWORD_LENGTH ? "too_long" : null;
}
//# sourceMappingURL=password.js.map