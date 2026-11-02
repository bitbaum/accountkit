"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { encode } from "uqr";
import { DEFAULT_AUTH_LABELS } from "./labels.js";
import { unbroken } from "./unbroken.js";
/** Lightning login's words; every one has an English default. */
export function lightningWords(labels) {
    const d = DEFAULT_AUTH_LABELS.lightning;
    return { ...d, ...labels.lightning };
}
/** A QR code as one SVG path: no script, no image request, any CSP. */
function QrCode({ text, title }) {
    const { data, size } = encode(text, { border: 2, ecc: "L" });
    let d = "";
    data.forEach((row, y) => row.forEach((on, x) => {
        if (on)
            d += `M${x} ${y}h1v1h-1z`;
    }));
    return (_jsx("svg", { role: "img", "aria-label": title, viewBox: `0 0 ${size} ${size}`, shapeRendering: "crispEdges", style: {
            width: "100%",
            maxWidth: 264,
            aspectRatio: "1",
            margin: "0 auto",
            display: "block",
            background: "#fff",
        }, children: _jsx("path", { d: d, fill: "#000" }) }));
}
/**
 * Show a challenge, then wait for the wallet. `purpose: "link"` adds the
 * wallet to the signed-in person; "sign-in" signs in (or creates the person).
 */
export function LightningLogin({ client, labels, classes: c, purpose, onDone, onTwoFactor, onBack, }) {
    const w = lightningWords(labels);
    const [lnurl, setLnurl] = useState(null);
    const [error, setError] = useState(null);
    const [expired, setExpired] = useState(false);
    const alive = useRef(true);
    const start = useCallback(async () => {
        setError(null);
        setExpired(false);
        setLnurl(null);
        const { data, error: e } = await client.start(purpose);
        if (!alive.current)
            return;
        if (e || !data)
            return setError(labels.errors.generic);
        setLnurl(data.lnurl);
    }, [client, purpose, labels]);
    useEffect(() => {
        alive.current = true;
        void start();
        return () => {
            alive.current = false;
        };
    }, [start]);
    useEffect(() => {
        if (!lnurl || expired)
            return;
        let stopped = false;
        const timer = setInterval(async () => {
            const { data, error: e } = purpose === "link" ? await client.link() : await client.signIn();
            if (stopped || !alive.current)
                return;
            if (e) {
                clearInterval(timer);
                if (e.code === "LIGHTNING_EXPIRED")
                    return setExpired(true);
                return setError(e.code === "LIGHTNING_KEY_TAKEN" ? w.taken : labels.errors.generic);
            }
            if (!data || data.status === "pending")
                return;
            clearInterval(timer);
            if ("twoFactorRedirect" in data && data.twoFactorRedirect && onTwoFactor)
                return onTwoFactor();
            onDone();
        }, 2000);
        return () => {
            stopped = true;
            clearInterval(timer);
        };
    }, [lnurl, expired, purpose, client, onDone, onTwoFactor, labels, w.taken]);
    return (_jsxs("div", { className: c.stack, children: [_jsx("p", { className: c.hint, children: w.prompt }), lnurl && !expired && _jsx(QrCode, { text: lnurl, title: w.qr }), lnurl && !expired && (_jsx("a", { className: c.button, href: `lightning:${lnurl}`, children: unbroken(w.open) })), expired && _jsx("p", { className: c.hint, children: w.expired }), error && (_jsx("p", { className: c.error, role: "alert", children: error })), (expired || error) && (_jsx("button", { type: "button", className: c.buttonQuiet, onClick: start, children: unbroken(w.retry) })), _jsx("button", { type: "button", className: c.buttonQuiet, onClick: onBack, children: unbroken(labels.back) })] }));
}
//# sourceMappingURL=lightning-login.js.map