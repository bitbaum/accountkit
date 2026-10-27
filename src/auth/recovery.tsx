"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { returnPath } from "../paths.js";
import {
  DEFAULT_AUTH_LABELS,
  DEFAULT_RECOVERY_LABELS,
  authErrorText,
  type AuthLabels,
} from "./labels.js";
import {
  DEFAULT_AUTH_CLASSES,
  type AuthClasses,
  type PasswordRecoveryClient,
} from "./react.js";
import type { SignInMethods } from "./methods.js";

/** The same request/reset journey on every product's existing sign-in page. */
export function PasswordRecoveryForm({
  client,
  methods,
  signInPath,
  next,
  onBack,
  token: initialToken,
  initialEmail = "",
  invalidToken = false,
  labels = DEFAULT_AUTH_LABELS,
  classes,
}: {
  client: PasswordRecoveryClient;
  methods: SignInMethods;
  signInPath: string;
  next: string;
  onBack: () => void;
  token?: string;
  initialEmail?: string;
  invalidToken?: boolean;
  labels?: AuthLabels;
  classes?: Partial<AuthClasses>;
}) {
  const c = { ...DEFAULT_AUTH_CLASSES, ...classes };
  const words = labels.recovery ?? DEFAULT_RECOVERY_LABELS;
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState(initialToken);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"sent" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(
    invalidToken ? words.invalidToken : null,
  );
  const canRequest = methods.passwordReset && !!client.requestPasswordReset;
  useEffect(() => {
    root.current?.querySelector<HTMLElement>("input, [role='status']")?.focus();
  }, [status, token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (token && password !== confirm) {
      setError(words.mismatch);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (token) {
        if (!client.resetPassword) {
          setError(labels.errors.unavailable);
          return;
        }
        const { error: failure } = await client.resetPassword({
          newPassword: password,
          token,
        });
        if (failure) {
          if (
            ["INVALID_TOKEN", "TOKEN_EXPIRED", "INVALID_RESET_TOKEN"].includes(
              failure.code ?? "",
            )
          ) {
            setToken(undefined);
            setError(words.invalidToken);
          } else setError(authErrorText(labels, failure));
          return;
        }
        setToken(undefined);
        setPassword("");
        setConfirm("");
        setStatus("reset");
      } else {
        if (!canRequest || !client.requestPasswordReset) {
          setError(labels.errors.unavailable);
          return;
        }
        const redirect = new URL(
          returnPath(signInPath),
          window.location.origin,
        );
        redirect.searchParams.delete("token");
        redirect.searchParams.delete("error");
        redirect.searchParams.set("next", returnPath(next));
        const { error: failure } = await client.requestPasswordReset({
          email,
          redirectTo: redirect.href,
        });
        if (failure) {
          setError(authErrorText(labels, failure));
          return;
        }
        setStatus("sent");
      }
    } catch {
      setError(labels.errors.unavailable);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={root} className={c.stack}>
      {status ? (
        <p role="status" tabIndex={-1} className={c.notice}>
          {status === "sent" ? words.sent : words.success}
        </p>
      ) : (
        <form className={c.stack} onSubmit={submit} aria-busy={busy}>
          {token ? (
            <>
              <div className={c.field}>
                <label className={c.label} htmlFor={`${id}-password`}>
                  {words.newPassword}
                </label>
                <input
                  className={c.input}
                  id={`${id}-password`}
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                  value={password}
                  disabled={busy}
                  aria-describedby={`${id}-hint`}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <p id={`${id}-hint`} className={c.hint}>
                  {labels.passwordHint}
                </p>
              </div>
              <div className={c.field}>
                <label className={c.label} htmlFor={`${id}-confirm`}>
                  {words.confirmPassword}
                </label>
                <input
                  className={c.input}
                  id={`${id}-confirm`}
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                  value={confirm}
                  disabled={busy}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </div>
            </>
          ) : canRequest ? (
            <div className={c.field}>
              <label className={c.label} htmlFor={`${id}-email`}>
                {labels.email}
              </label>
              <input
                className={c.input}
                id={`${id}-email`}
                type="email"
                autoComplete="email"
                required
                value={email}
                disabled={busy}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          ) : (
            <p role="status" className={c.notice}>
              {labels.errors.unavailable}
            </p>
          )}
          {error && (
            <p role="alert" className={c.error}>
              {error}
            </p>
          )}
          {(token || canRequest) && (
            <button className={c.button} type="submit" disabled={busy}>
              {token ? words.reset : words.send}
            </button>
          )}
        </form>
      )}
      <button
        type="button"
        className={c.buttonQuiet}
        disabled={busy}
        onClick={onBack}
      >
        {labels.signIn}
      </button>
    </div>
  );
}
