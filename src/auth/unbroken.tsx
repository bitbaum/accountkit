import type { ReactNode } from "react";

/**
 * A word with a hyphen inside it ("E-Mail", "e-mail", "pled-clav") is never
 * split across two lines: a browser may break after any hyphen, and a button
 * at 390px read "per E- / Mail schicken". Each such word is kept whole in a
 * nowrap span, inline so it holds without the stylesheet. Spaces still wrap.
 *
 * The parts go inside ONE span. A button styled `display: flex` (AccountKit's
 * own stylesheet, and evig's) lays each child text node and span out as its
 * own flex item, side by side: evig's label read "Stattdessen einen /
 * Anmeldelink per | E-Mail | schicken" in three columns. One child is one
 * flex item, and the sentence wraps as a sentence.
 */
const HYPHENATED = /(\S*\p{L}-\p{L}\S*)/u;

export function unbroken(text: string): ReactNode {
  const parts = text.split(HYPHENATED);
  if (parts.length === 1) return text;
  return (
    <span>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} style={{ whiteSpace: "nowrap" }}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </span>
  );
}
