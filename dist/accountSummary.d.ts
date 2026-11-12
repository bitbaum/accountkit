/**
 * Read a session that lives on another origin: a product's account control
 * on a static site asks the product that holds the account who is signed in.
 *
 * A GET with the browser's cookies for that origin (`credentials: "include"`;
 * the server answers credentialed CORS for this origin) and never from a cache
 * (`cache: "no-store"`). Resolves the parsed body when the response is 2xx
 * JSON with a boolean `signedIn`. Resolves `null` on anything else (a network
 * or CORS failure, an abort, a timeout, a non-2xx status, a body that is not
 * JSON or has no `signedIn`, an injected `fetch` that returns something that
 * is not a response), so a header fails closed to "Sign in" and the promise
 * never rejects. No retries and nothing stored.
 *
 * `timeoutMs` (default 8000; 0, a negative number or Infinity turns it off) bounds the whole read,
 * body included, so a server that stalls cannot leave a header loading for
 * ever. It is combined with the caller's `signal`: whichever fires first
 * aborts the request and the promise resolves `null`.
 */
export declare function fetchAccountSummary<T extends {
    signedIn: boolean;
}>(url: string, init?: {
    signal?: AbortSignal;
    fetch?: typeof fetch;
    timeoutMs?: number;
}): Promise<T | null>;
//# sourceMappingURL=accountSummary.d.ts.map