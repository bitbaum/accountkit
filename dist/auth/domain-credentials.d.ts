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
export declare function domainCredentialsPlugin(credentials: DomainCredentials): {
    id: string;
    hooks: {
        before: {
            matcher: () => boolean;
            handler: import("better-auth").Middleware<import("better-auth").MiddlewareOptions, (inputContext: import("better-auth").MiddlewareInputContext<import("better-auth").MiddlewareOptions>) => Promise<void>>;
        }[];
    };
    endpoints: {
        signInDomain: import("better-auth").StrictEndpoint<"/sign-in/domain", {
            method: "POST";
            use: import("better-auth").Middleware<import("better-auth").MiddlewareOptions, (inputContext: import("better-auth").MiddlewareInputContext<import("better-auth").MiddlewareOptions>) => Promise<void>>[];
            body: z.ZodObject<{
                credential: z.ZodString;
            }, z.core.$strip>;
        }, {
            success: boolean;
            user: {
                id: string;
            };
        }>;
    };
};
//# sourceMappingURL=domain-credentials.d.ts.map