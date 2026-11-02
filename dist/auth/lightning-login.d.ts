import type { AuthLabels } from "./labels.js";
type Fetched<T> = Promise<{
    data?: T | null;
    error?: {
        code?: string;
        message?: string;
        status?: number;
    } | null;
}>;
/** The calls ./client's lightningClient() adds to a better-auth client. */
export interface LightningClient {
    start(purpose?: "sign-in" | "link"): Fetched<{
        k1: string;
        lnurl: string;
    }>;
    signIn(): Fetched<{
        status: string;
        twoFactorRedirect?: boolean;
    }>;
    link(): Fetched<{
        status: string;
    }>;
}
/** Lightning login's words; every one has an English default. */
export declare function lightningWords(labels: AuthLabels): {
    withLightning: string;
    name: string;
    prompt: string;
    qr: string;
    open: string;
    expired: string;
    retry: string;
    taken: string;
};
/**
 * Show a challenge, then wait for the wallet. `purpose: "link"` adds the
 * wallet to the signed-in person; "sign-in" signs in (or creates the person).
 */
export declare function LightningLogin({ client, labels, classes: c, purpose, onDone, onTwoFactor, onBack, }: {
    client: LightningClient;
    labels: AuthLabels;
    classes: {
        stack: string;
        hint: string;
        error: string;
        button: string;
        buttonQuiet: string;
    };
    purpose: "sign-in" | "link";
    onDone: () => void;
    onTwoFactor?: () => void;
    onBack: () => void;
}): import("react").JSX.Element;
export {};
//# sourceMappingURL=lightning-login.d.ts.map