import { type AuthLabels } from "./labels.js";
/** The languages with a full set of labels. */
export declare const AUTH_LABEL_LOCALES: string[];
/**
 * The labels for a locale such as `de`, `de-CH` or `fr`. Unknown languages
 * get English, which is the package's own default.
 */
export declare function authLabelsFor(locale: string | null | undefined): AuthLabels;
//# sourceMappingURL=translations.d.ts.map