/**
 * The language a sign-in provider's own page should speak: OIDC `ui_locales`.
 *
 * A reader on Heidi's German pages pressed the shared sign-in button and got
 * its page in English, because the provider could only guess from the
 * browser's `Accept-Language`. The product knows which language it was
 * showing, so the authorize request says it (OIDC Core 3.1.2.1).
 *
 * The product's own `locale` wins; without one, the page's `<html lang>` —
 * which every bitbaum app already sets to the language of the page — so an
 * app that passes nothing still sends the right language. Anything that is
 * not a language tag is dropped rather than sent.
 */
export declare function uiLocalesFor(locale?: string | null): string | undefined;
/** The providers that speak OIDC and read `ui_locales`: the shared sign-in and OrangeCat. */
export declare const UI_LOCALES_PROVIDERS: readonly string[];
//# sourceMappingURL=ui-locales.d.ts.map