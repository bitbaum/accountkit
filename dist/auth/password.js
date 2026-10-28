/**
 * The one password rule, for every product and every path: sign-up, reset,
 * change, server and form. Only that a password exists (and a ceiling so the
 * hash input stays bounded). No length floor beyond that, no character
 * classes, no strength meter, no hint text.
 */
export const MIN_PASSWORD_LENGTH = 1;
export const MAX_PASSWORD_LENGTH = 128;
//# sourceMappingURL=password.js.map