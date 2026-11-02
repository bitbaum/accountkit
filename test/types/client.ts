// Compiles only if a product can hand AccountKit's client plugins to
// better-auth's own createAuthClient, and the client to the shared screens.
import { createAuthClient } from "better-auth/react";
import { authClientPlugins } from "../../src/auth/client.js";
import type { AuthClientLike } from "../../src/auth/react.js";

export const authClient = createAuthClient({ plugins: authClientPlugins() });
export const screensClient: AuthClientLike = authClient;
