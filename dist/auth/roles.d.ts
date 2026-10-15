/**
 * What a person is to this product. One account, one role, held in the app's
 * own `users` table — customers, the people who help them, professionals,
 * staff and admins all sign in the same way (fleet STACK.md, "Identity").
 *
 * Adding a role is one line here. A role is never chosen by the person it
 * describes: sign-up ignores it, and only `pnpm run role:grant` changes it.
 */
export declare const ROLES: readonly ["customer", "helper", "professional", "staff", "admin"];
export type Role = (typeof ROLES)[number];
export declare const DEFAULT_ROLE: Role;
export declare function isRole(value: unknown): value is Role;
export declare function isStaff(role: unknown): boolean;
/** Only an admin may change roles, and nobody may change their own. */
export declare function mayGrantRole(actor: {
    id: string;
    role: unknown;
}, targetId: string): boolean;
//# sourceMappingURL=roles.d.ts.map