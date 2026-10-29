import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  formCsrfMiddleware,
  getSessionFromCtx,
  originCheckMiddleware,
  setShouldSkipSessionRefresh,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

/** Product-owned identity proof, with shared session lifecycle and cookies. */
export interface DomainCredentials {
  verify(credential: string): Promise<{
    /** An existing shared account user; never an email or a client-supplied id. */
    userId: string;
    /**
     * Persist product restrictions (for example, which of two identities a code
     * grants) before exposing the session. Throwing revokes it and fails closed.
     * Store restrictions against the session id, with cascade deletion.
     */
    bindSession?: (sessionId: string) => Promise<void>;
  } | null>;
}

export function domainCredentialsPlugin(credentials: DomainCredentials) {
  const marker = (id: string) => `accountkit-domain-session:${id}`;
  const proofRoutes = new Set([
    "/get-session",
    "/sign-out",
    "/sign-up/email",
    "/provision/claim",
    "/request-password-reset",
    "/forget-password",
    "/reset-password",
    "/verify-email",
    "/send-verification-email",
    "/magic-link/verify",
    "/passkey/generate-authenticate-options",
    "/passkey/verify-authentication",
    "/two-factor/verify-totp",
    "/two-factor/verify-otp",
    "/two-factor/verify-backup-code",
  ]);
  return {
    id: "accountkit-domain-credentials",
    hooks: {
      before: [
        {
          matcher: () => true,
          handler: createAuthMiddleware(async (ctx) => {
            const current = await getSessionFromCtx(ctx, {
              disableRefresh: true,
            });
            if (!current) return;
            const proof =
              await ctx.context.internalAdapter.findVerificationValue(
                marker(current.session.id),
              );
            if (proof && proof.expiresAt > new Date()) {
              // The restriction must not expire before a sliding session does.
              // Domain sessions have a fixed lifetime; authenticate again to
              // renew rather than silently extending beyond the marker.
              await setShouldSkipSessionRefresh(true);
              if (
                proofRoutes.has(ctx.path ?? "") ||
                ctx.path?.startsWith("/sign-in/") ||
                ctx.path?.startsWith("/callback/") ||
                ctx.path?.startsWith("/oauth2/callback/")
              )
                return;
              throw new APIError("FORBIDDEN", {
                code: "SESSION_EXPIRED",
                message:
                  "Sign in with a password, passkey or configured provider before managing account security",
              });
            }
          }),
        },
      ],
    },
    endpoints: {
      signInDomain: createAuthEndpoint(
        "/sign-in/domain",
        {
          method: "POST",
          use: [formCsrfMiddleware, originCheckMiddleware],
          body: z.object({ credential: z.string().min(1).max(1024) }),
        },
        async (ctx) => {
          const identity = await credentials.verify(ctx.body.credential);
          const user = identity
            ? await ctx.context.internalAdapter.findUserById(identity.userId)
            : null;
          if (!identity || !user)
            throw new APIError("UNAUTHORIZED", {
              message: "Invalid credential",
            });
          // A domain proof cannot stand in for an enrolled second factor. Its
          // product context cannot yet survive the native MFA session replacement.
          // Refuse before creating a session, and offer another configured method.
          if ("twoFactorEnabled" in user && user.twoFactorEnabled) {
            throw new APIError("FORBIDDEN", {
              message:
                "Use another configured sign-in method to complete your second factor",
              code: "DOMAIN_CREDENTIAL_REQUIRES_ANOTHER_METHOD",
            });
          }
          const session = await ctx.context.internalAdapter.createSession(
            user.id,
          );
          if (!session)
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "Unable to create session",
            });
          try {
            await identity.bindSession?.(session.id);
            // Domain proof is deliberately narrower than mailbox, password or
            // passkey control. It cannot enroll credentials, change email,
            // enable MFA or expose other sessions of a dual-identity account.
            await ctx.context.internalAdapter.createVerificationValue({
              identifier: marker(session.id),
              value: user.id,
              expiresAt: session.expiresAt,
            });
          } catch {
            await ctx.context.internalAdapter.deleteSession(session.token);
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "Unable to establish identity context",
            });
          }
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ success: true, user: { id: user.id } });
        },
      ),
    },
  };
}
