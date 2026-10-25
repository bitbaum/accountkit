import { createAuthClient } from "better-auth/react";
import { authClientPlugins } from "../../src/auth/client.js";
import type { AuthClientLike } from "../../src/auth/react.js";

const client = createAuthClient({ plugins: authClientPlugins() });
const compatible: AuthClientLike = client;
export { compatible };
