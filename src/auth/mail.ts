import {
  conventionalFrom,
  isMailConfigured,
  sendMail,
} from "@bitbaum/mail-kit";
import { isDeliverable } from "./methods.js";
import type {
  AuthMailer,
  AuthMailExtra,
  AuthMailKind,
  AuthSite,
} from "./server.js";

/** "123456" → "123 456": easier to read off one screen and type into another. */
export const spacedCode = (code: string) =>
  code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;

/** One account mail, in the product's own words and look. */
export interface RenderedAuthMail {
  subject: string;
  text: string;
  html?: string;
}

export interface AuthMailOptions {
  site: Pick<AuthSite, "title" | "url">;
  /** Read lazily so a build never captures deployment credentials. */
  env?: () => Record<string, string | undefined>;
  subjects?: Partial<Record<AuthMailKind, string>>;
  /**
   * The product's own template (its languages, its HTML). Gets the link and,
   * for a sign-in link, the code (`extra.code`); the transport, the origin
   * check and the undeliverable-address rule stay the mailer's.
   */
  render?: (
    kind: AuthMailKind,
    url: string,
    extra: AuthMailExtra,
  ) => RenderedAuthMail;
  /**
   * Whether `render` prints `extra.code`. Only then is a sign-in code minted.
   * Without `render` the shared template prints it, so this defaults to true.
   */
  codes?: boolean;
  /**
   * A product's own mail for one kind (evig confirms an address with its own
   * 6-digit code). Resolves true when it sent; false falls back to the shared
   * mail for that kind.
   */
  own?: Partial<
    Record<
      AuthMailKind,
      (to: string, url: string, extra: AuthMailExtra) => Promise<boolean>
    >
  >;
}

/** Shared account-mail adapter; a no-op sender is never reported as configured. */
export function createAuthMailer(options: AuthMailOptions): AuthMailer {
  const env = () => {
    const values = options.env?.() ?? process.env;
    return {
      ...values,
      APP_URL: options.site.url,
      RESEND_FROM: values.RESEND_FROM || conventionalFrom(options.site.title),
    };
  };
  const subjects: Record<AuthMailKind, string> = {
    verify: `Confirm your email for ${options.site.title}`,
    magicLink: `Sign in to ${options.site.title}`,
    reset: `Reset your ${options.site.title} password`,
    ...options.subjects,
  };
  return {
    get configured() {
      return isMailConfigured(env());
    },
    // The sign-in link's email also carries a code (./sign-in-code).
    codes: options.render ? options.codes === true : options.codes !== false,
    async send(kind, to, url, extra = {}) {
      // A placeholder address (an OIDC person without email) can receive nothing.
      if (!isDeliverable(to)) return;
      // Refuse unexpected origins before sending a bearer credential by email.
      let sameOrigin = false;
      try {
        sameOrigin = new URL(url).origin === new URL(options.site.url).origin;
      } catch {
        /* Invalid links must never reach a recipient. */
      }
      if (!sameOrigin) {
        console.error(
          "[auth] refusing account email with an unexpected origin",
        );
        return;
      }
      const own = options.own?.[kind];
      if (own) {
        try {
          if (await own(to, url, extra)) return;
        } catch (error) {
          console.error(
            `[auth] the product's own ${kind} mail failed: ${(error as Error).name}`,
          );
        }
      }
      const mail: RenderedAuthMail = options.render
        ? options.render(kind, url, extra)
        : {
            subject: subjects[kind],
            text:
              kind === "magicLink" && extra.code
                ? `${subjects[kind]}\n\n${url}\n\nOn another device? Type this code on the page where you asked for the link: ${spacedCode(extra.code)}\nThe link and the code each work for 10 minutes.\n\nIf you did not request this, you can ignore this email.`
                : `${subjects[kind]}\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
          };
      const result = await sendMail({ to, ...mail }, { env: env() });
      if (!result.sent)
        console.error(
          "[auth] account email delivery failed",
          result.status ?? "transport",
        );
    },
  };
}
