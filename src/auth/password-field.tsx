"use client";

import { useState } from "react";
import { DEFAULT_AUTH_LABELS, type AuthLabels } from "./labels.js";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./password.js";
import type { AuthClasses } from "./react.js";

type FieldClasses = Pick<AuthClasses, "input" | "inputWrap" | "reveal">;

/** Styled by @bitbaum/accountkit/styles.css; a product with its own CSS passes `classes`. */
const DEFAULT_FIELD_CLASSES: FieldClasses = {
  input: "acct-auth-input",
  inputWrap: "acct-auth-input-wrap",
  reveal: "acct-auth-reveal",
};

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
  autoComplete = "new-password",
  name,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (password: string) => void;
  /** Class names for the input, its box and the eye; defaults to the package's own. */
  classes?: Partial<FieldClasses>;
  /** Only `passwordVisibility` is read; defaults to English. */
  labels?: Pick<AuthLabels, "passwordVisibility">;
  disabled?: boolean;
  autoComplete?: "new-password" | "current-password";
  name?: string;
  placeholder?: string;
}) {
  const c = { ...DEFAULT_FIELD_CLASSES, ...classes };
  const [visible, setVisible] = useState(false);
  const words =
    labels?.passwordVisibility ?? DEFAULT_AUTH_LABELS.passwordVisibility!;
  return (
    <div className={c.inputWrap}>
      <input
        id={id}
        name={name}
        placeholder={placeholder}
        type={visible ? "text" : "password"}
        className={c.input}
        autoComplete={autoComplete}
        minLength={MIN_PASSWORD_LENGTH}
        maxLength={MAX_PASSWORD_LENGTH}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        required
      />
      <button
        type="button"
        className={c.reveal}
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
