"use client";

import { useState } from "react";
import { DEFAULT_AUTH_LABELS, type AuthLabels } from "./labels.js";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./password.js";
import type { AuthClasses } from "./react.js";

/** An eye, struck through while the password shows. Decorative: the button carries the words. */
function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {open && <path d="M3 3l18 18" />}
    </svg>
  );
}

/**
 * The one new-password field: a single input with a show/hide eye, the one
 * rule from ./password.ts, and nothing else. Sign-up and the reset form both
 * render it, so the two cannot drift apart.
 */
export function PasswordField({
  id,
  value,
  onChange,
  classes,
  labels,
  disabled = false,
}: {
  id: string;
  value: string;
  onChange: (password: string) => void;
  classes: Pick<AuthClasses, "input" | "inputWrap" | "reveal">;
  labels: AuthLabels;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const words =
    labels.passwordVisibility ?? DEFAULT_AUTH_LABELS.passwordVisibility!;
  return (
    <div className={classes.inputWrap}>
      <input
        id={id}
        type={visible ? "text" : "password"}
        className={classes.input}
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        maxLength={MAX_PASSWORD_LENGTH}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        required
      />
      <button
        type="button"
        className={classes.reveal}
        aria-controls={id}
        aria-pressed={visible}
        aria-label={visible ? words.hide : words.show}
        onClick={() => setVisible((v) => !v)}
      >
        <EyeIcon open={visible} />
      </button>
    </div>
  );
}
