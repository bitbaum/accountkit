/** How long `fetchAccountSummary` waits by default before it gives up. */
const DEFAULT_TIMEOUT_MS = 8000;
/** The longest delay a timer can hold; a longer one fires at once. */
const MAX_TIMER_MS = 2 ** 31 - 1;
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
export async function fetchAccountSummary(url, init = {}) {
    // Called through globalThis: a bare reference to the browser's fetch,
    // called detached, throws "Illegal invocation".
    const request = init.fetch ?? ((input, options) => globalThis.fetch(input, options));
    const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const caller = init.signal;
    if (caller?.aborted)
        return null;
    const cleanup = [];
    let signal = caller;
    // Not finite (Infinity, NaN) means no timeout: a timer cannot hold more
    // than 2^31-1 ms, and an overflowing one fires at once.
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        const timer = new AbortController();
        const id = setTimeout(() => timer.abort(), Math.min(timeoutMs, MAX_TIMER_MS));
        cleanup.push(() => clearTimeout(id));
        signal = caller ? anySignal([caller, timer.signal], cleanup) : timer.signal;
    }
    // The abort also settles the promise itself, so a fetch that ignores its
    // signal (an injected one, or a body that never finishes) cannot hang it.
    let settleOnAbort;
    const aborted = new Promise((resolve) => {
        if (!signal)
            return;
        settleOnAbort = () => resolve(null);
        signal.addEventListener("abort", settleOnAbort, { once: true });
    });
    if (signal && settleOnAbort) {
        const s = signal;
        const f = settleOnAbort;
        cleanup.push(() => s.removeEventListener("abort", f));
    }
    try {
        return await Promise.race([read(request, url, signal), aborted]);
    }
    finally {
        for (const done of cleanup)
            done();
    }
}
async function read(request, url, signal) {
    try {
        const response = await request(url, {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            signal,
        });
        if (typeof response !== "object" ||
            response === null ||
            response.ok !== true) {
            return null;
        }
        const body = await response.json();
        if (typeof body !== "object" ||
            body === null ||
            typeof body.signedIn !== "boolean") {
            return null;
        }
        return body;
    }
    catch {
        return null;
    }
}
/** `AbortSignal.any` where the runtime has it; the same by hand otherwise. */
function anySignal(signals, cleanup) {
    const any = AbortSignal.any;
    if (typeof any === "function")
        return any.call(AbortSignal, signals);
    return anySignalFallback(signals, cleanup);
}
function anySignalFallback(signals, cleanup) {
    const combined = new AbortController();
    for (const s of signals) {
        if (s.aborted) {
            combined.abort(s.reason);
            return combined.signal;
        }
    }
    for (const s of signals) {
        const onAbort = () => combined.abort(s.reason);
        s.addEventListener("abort", onAbort, { once: true });
        cleanup.push(() => s.removeEventListener("abort", onAbort));
    }
    return combined.signal;
}
//# sourceMappingURL=accountSummary.js.map