"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { encode } from "uqr";
import type { AuthLabels } from "./labels.js";
import { DEFAULT_AUTH_LABELS } from "./labels.js";
import { unbroken } from "./unbroken.js";

type Fetched<T> = Promise<{
  data?: T | null;
  error?: { code?: string; message?: string; status?: number } | null;
}>;

/** The calls ./client's lightningClient() adds to a better-auth client. */
export interface LightningClient {
  start(purpose?: "sign-in" | "link"): Fetched<{ k1: string; lnurl: string }>;
  signIn(): Fetched<{ status: string; twoFactorRedirect?: boolean }>;
  link(): Fetched<{ status: string }>;
}

/** Lightning login's words; every one has an English default. */
export function lightningWords(labels: AuthLabels) {
  const d = DEFAULT_AUTH_LABELS.lightning!;
  return { ...d, ...labels.lightning };
}

/** A QR code as one SVG path: no script, no image request, any CSP. */
function QrCode({ text, title }: { text: string; title: string }) {
  const { data, size } = encode(text, { border: 2, ecc: "L" });
  let d = "";
  data.forEach((row, y) =>
    row.forEach((on, x) => {
      if (on) d += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return (
    <svg
      role="img"
      aria-label={title}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      style={{
        width: "100%",
        maxWidth: 264,
        aspectRatio: "1",
        margin: "0 auto",
        display: "block",
        background: "#fff",
      }}
    >
      <path d={d} fill="#000" />
    </svg>
  );
}

/**
 * Show a challenge, then wait for the wallet. `purpose: "link"` adds the
 * wallet to the signed-in person; "sign-in" signs in (or creates the person).
 */
export function LightningLogin({
  client,
  labels,
  classes: c,
  purpose,
  onDone,
  onTwoFactor,
  onBack,
}: {
  client: LightningClient;
  labels: AuthLabels;
  classes: {
    stack: string;
    hint: string;
    error: string;
    button: string;
    buttonQuiet: string;
  };
  purpose: "sign-in" | "link";
  onDone: () => void;
  onTwoFactor?: () => void;
  onBack: () => void;
}) {
  const w = lightningWords(labels);
  const [lnurl, setLnurl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const alive = useRef(true);

  const start = useCallback(async () => {
    setError(null);
    setExpired(false);
    setLnurl(null);
    const { data, error: e } = await client.start(purpose);
    if (!alive.current) return;
    if (e || !data) return setError(labels.errors.generic);
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
    if (!lnurl || expired) return;
    let stopped = false;
    const timer = setInterval(async () => {
      const { data, error: e } =
        purpose === "link" ? await client.link() : await client.signIn();
      if (stopped || !alive.current) return;
      if (e) {
        clearInterval(timer);
        if (e.code === "LIGHTNING_EXPIRED") return setExpired(true);
        return setError(
          e.code === "LIGHTNING_KEY_TAKEN" ? w.taken : labels.errors.generic,
        );
      }
      if (!data || data.status === "pending") return;
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

  return (
    <div className={c.stack}>
      <p className={c.hint}>{w.prompt}</p>
      {lnurl && !expired && <QrCode text={lnurl} title={w.qr} />}
      {lnurl && !expired && (
        <a className={c.button} href={`lightning:${lnurl}`}>
          {unbroken(w.open)}
        </a>
      )}
      {expired && <p className={c.hint}>{w.expired}</p>}
      {error && (
        <p className={c.error} role="alert">
          {error}
        </p>
      )}
      {(expired || error) && (
        <button type="button" className={c.buttonQuiet} onClick={start}>
          {unbroken(w.retry)}
        </button>
      )}
      <button type="button" className={c.buttonQuiet} onClick={onBack}>
        {unbroken(labels.back)}
      </button>
    </div>
  );
}
