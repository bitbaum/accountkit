import { createAuthMiddleware, isAPIError } from "better-auth/api";

/**
 * A completed password reset proves control of the mailbox the link was sent
 * to, so it verifies that address. better-auth does not: an imported or
 * invited account with an unverified address would set its password and then
 * be refused at sign-in, with mail configured, for the very address it just
 * proved.
 *
 * The address is recorded when the link is SENT and compared when it is used:
 * if the account's address changed in between, nothing is verified.
 */
const marker = (token: string) => `accountkit-reset-address:${token}`;
const RESET_LINK_SECONDS = 60 * 60;

export interface RecordResetAddress {
  createVerificationValue(data: {
    identifier: string;
    value: string;
    expiresAt: Date;
  }): Promise<unknown>;
}

export async function recordResetAddress(
  adapter: RecordResetAddress,
  token: string,
  user: { id: string; email: string },
): Promise<void> {
  await adapter.createVerificationValue({
    identifier: marker(token),
    value: JSON.stringify({ userId: user.id, email: user.email }),
    expiresAt: new Date(Date.now() + RESET_LINK_SECONDS * 1000),
  });
}

export function recoveryVerificationPlugin() {
  return {
    id: "accountkit-recovery-verification",
    hooks: {
      after: [
        {
          matcher: (ctx: { path?: string }) => ctx.path === "/reset-password",
          handler: createAuthMiddleware(async (ctx) => {
            const token =
              (ctx.body as { token?: string } | undefined)?.token ??
              (ctx.query as { token?: string } | undefined)?.token;
            if (!token) return;
            const adapter = ctx.context.internalAdapter;
            const recorded = await adapter.findVerificationValue(marker(token));
            if (!recorded) return;
            await adapter.deleteVerificationByIdentifier(marker(token));
            if (isAPIError(ctx.context.returned)) return;
            const sent = JSON.parse(recorded.value) as {
              userId: string;
              email: string;
            };
            const user = await adapter.findUserById(sent.userId);
            if (
              !user ||
              user.emailVerified ||
              user.email.toLowerCase() !== sent.email.toLowerCase()
            )
              return;
            await adapter.updateUser(user.id, { emailVerified: true });
          }),
        },
      ],
    },
  };
}
