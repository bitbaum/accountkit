export interface RecordResetAddress {
    createVerificationValue(data: {
        identifier: string;
        value: string;
        expiresAt: Date;
    }): Promise<unknown>;
}
export declare function recordResetAddress(adapter: RecordResetAddress, token: string, user: {
    id: string;
    email: string;
}): Promise<void>;
export declare function recoveryVerificationPlugin(): {
    id: string;
    hooks: {
        after: {
            matcher: (ctx: {
                path?: string;
            }) => boolean;
            handler: import("better-auth").Middleware<import("better-auth").MiddlewareOptions, (inputContext: import("better-auth").MiddlewareInputContext<import("better-auth").MiddlewareOptions>) => Promise<void>>;
        }[];
    };
};
//# sourceMappingURL=recovery-verification.d.ts.map