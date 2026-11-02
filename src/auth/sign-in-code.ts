import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";
import type { BetterAuthPlugin } from "better-auth";

/**
 * A sign-in code in the sign-in link's email.
 *
 * The link opens wherever the mail app opens it: often another browser, or
 * another device, than the one the person asked on. The same email now also
 * carries a six-digit code to type on the page that asked for it. It is the
 * same method (an email that proves the address), so it needs nothing beyond
 * the mail a product already sends, and no third party.
 *
 * - A code is minted only together with a sign-in link, and travels only in
 *   that email. better-auth's own "send me a code" endpoint and its code-based
 *   reset, verification and email-change endpoints stay closed: recovery keeps
 *   its one path (a reset link), with its address and session rules.
 * - Six digits, ten minutes, three tries, stored hashed. Guessing spends the
 *   credential bucket (`/sign-in/email-otp` falls under `/sign-in/email`).
 * - A second factor applies to it as to every other way in (./factor).
 * - Only a mailer that says it can carry a code (`codes: true`, which
 *   `createAuthMailer` does) gets one. The link request then answers
 *   `{ code: true }`, so the screens offer the field only when the mail has it.
 */
export const SIGN_IN_CODE_LENGTH = 6;
export const SIGN_IN_CODE_SECONDS = 10 * 60;
export const SIGN_IN_CODE_TRIES = 3;

/** Paths of better-auth's email-OTP plugin that AccountKit does not offer. */
export function closedCodePath(path: string | undefined): boolean {
  return /^\/(?:email-otp\/|forget-password\/email-otp(?:$|\/))/.test(
    path ?? "",
  );
}

export function signInCodePlugins(): BetterAuthPlugin[] {
  return [
    emailOTP({
      otpLength: SIGN_IN_CODE_LENGTH,
      expiresIn: SIGN_IN_CODE_SECONDS,
      allowedAttempts: SIGN_IN_CODE_TRIES,
      storeOTP: "hashed",
      // Never called: its endpoint is closed below, and the code is minted
      // with createVerificationOTP inside the sign-in link's own email.
      sendVerificationOTP: async () => {},
    }) as unknown as BetterAuthPlugin,
    {
      id: "accountkit-sign-in-code",
      hooks: {
        before: [
          {
            matcher: (ctx) => closedCodePath(ctx.path),
            handler: createAuthMiddleware(async () => {
              throw new APIError("NOT_FOUND");
            }),
          },
        ],
        after: [
          {
            matcher: (ctx) => ctx.path === "/sign-in/magic-link",
            handler: createAuthMiddleware(async (ctx) => {
              const returned = ctx.context.returned;
              if (
                !returned ||
                returned instanceof Error ||
                returned instanceof Response ||
                typeof returned !== "object"
              )
                return;
              return ctx.json({ ...returned, code: true });
            }),
          },
        ],
      },
    },
  ];
}

/** Mint the code that rides in the sign-in link's email. */
export async function mintSignInCode(
  api: unknown,
  email: string,
): Promise<string | undefined> {
  const create = (
    api as {
      createVerificationOTP?: (input: {
        body: { email: string; type: "sign-in" };
      }) => Promise<string>;
    }
  ).createVerificationOTP;
  if (!create) return undefined;
  try {
    return await create({ body: { email, type: "sign-in" } });
  } catch {
    // A link without a code is still a working email.
    return undefined;
  }
}
