import type { ReactNode } from "react";

/**
 * A word with a hyphen inside it ("E-Mail", "e-mail", "pled-clav") is never
 * split across two lines: a browser may break after any hyphen, and a button
 * at 390px read "per E- / Mail schicken". Each such word is kept whole in a
 * nowrap span, inline so it holds without the stylesheet. Spaces still wrap.
 */
const HYPHENATED = /(\S*\p{L}-\p{L}\S*)/u;

export function unbroken(text: string): ReactNode {
  const parts = text.split(HYPHENATED);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} style={{ whiteSpace: "nowrap" }}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}
