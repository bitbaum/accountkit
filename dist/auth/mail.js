import { conventionalFrom, isMailConfigured, sendMail, } from "@bitbaum/mail-kit";
/** "123456" → "123 456": easier to read off one screen and type into another. */
export const spacedCode = (code) => code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
/** Shared account-mail adapter; a no-op sender is never reported as configured. */
export function createAuthMailer(options) {
    const env = () => {
        const values = options.env?.() ?? process.env;
        return {
            ...values,
            APP_URL: options.site.url,
            RESEND_FROM: values.RESEND_FROM || conventionalFrom(options.site.title),
        };
    };
    const subjects = {
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
        codes: true,
        async send(kind, to, url, extra) {
            // Refuse unexpected origins before sending a bearer credential by email.
            let sameOrigin = false;
            try {
                sameOrigin = new URL(url).origin === new URL(options.site.url).origin;
            }
            catch {
                /* Invalid links must never reach a recipient. */
            }
            if (!sameOrigin) {
                console.error("[auth] refusing account email with an unexpected origin");
                return;
            }
            const result = await sendMail({
                to,
                subject: subjects[kind],
                text: kind === "magicLink" && extra?.code
                    ? `${subjects[kind]}\n\n${url}\n\nOn another device? Type this code on the page where you asked for the link: ${spacedCode(extra.code)}\nThe link and the code each work for 10 minutes.\n\nIf you did not request this, you can ignore this email.`
                    : `${subjects[kind]}\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
            }, { env: env() });
            if (!result.sent)
                console.error("[auth] account email delivery failed", result.status ?? "transport");
        },
    };
}
//# sourceMappingURL=mail.js.map