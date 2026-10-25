import { twoFactor } from "better-auth/plugins";
/** Resolve only app-local challenge UI and return URLs; never carry bearer values. */
export declare function factorDestination(origin: string, screen: unknown, next: unknown): string;
/** Reuse BetterAuth's challenge/trusted-device policy for every primary method. */
export declare function factorForAllMethods(site: {
    title: string;
    url: string;
}): ReturnType<typeof twoFactor>;
//# sourceMappingURL=factor.d.ts.map