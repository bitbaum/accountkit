// An Auth.js product has no Better Auth client. The recovery form takes only
// the two calls it makes, so a plain adapter object must satisfy it, and so
// must a full Better Auth client (backward compatible).
import { createAuthClient } from "better-auth/react";
import { authClientPlugins } from "../../src/auth/client.js";
import type {
  AuthClientLike,
  PasswordRecoveryClient,
} from "../../src/auth/react.js";

const adapter: PasswordRecoveryClient = {
  requestPasswordReset: async () => ({ error: { code: "FAILED" } }),
  resetPassword: async () => ({ data: {} }),
};

const betterAuth: PasswordRecoveryClient = createAuthClient({
  plugins: authClientPlugins(),
});

declare const full: AuthClientLike;
const fromFull: PasswordRecoveryClient = full;

export { adapter, betterAuth, fromFull };
