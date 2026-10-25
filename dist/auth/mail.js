import { conventionalFrom, isMailConfigured, sendMail, } from "@bitbaum/mail-kit";
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
        async send(kind, to, url) {
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
                text: `${subjects[kind]}\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
            }, { env: env() });
            if (!result.sent)
                console.error("[auth] account email delivery failed", result.status ?? "transport");
        },
    };
}
//# sourceMappingURL=mail.js.map