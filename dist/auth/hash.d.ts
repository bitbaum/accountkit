/**
 * Password hashing for products that keep their own bcrypt account code
 * (next-auth credentials, Express backends). Hand it `bcrypt` or `bcryptjs`:
 * the package does not depend on either.
 *
 * Why this exists. bcrypt reads only the first 72 bytes of its input, so with
 * the one rule (up to 128 characters) a long password was silently only
 * partly checked. New hashes here are bcrypt over the base64 of the
 * password's SHA-256, so every character counts, and are stored as
 * `$bs1$<bcrypt hash>`.
 *
 * Existing passwords keep working. A hash without the `$bs1$` prefix is a
 * plain bcrypt hash: it is checked exactly as before, and once the person has
 * signed in with it, `rehash` says to store the new form. Nobody is locked out
 * and nobody has to reset anything.
 */
export interface BcryptLike {
    hash(plain: string, rounds: number): Promise<string>;
    compare(plain: string, hash: string): Promise<boolean>;
}
export declare const PASSWORD_HASH_PREFIX = "$bs1$";
export declare const BCRYPT_ROUNDS = 12;
export interface PasswordHasher {
    /** The value to store. */
    hash(plain: string): Promise<string>;
    /**
     * Whether `plain` matches `stored`, and whether `stored` is the old plain
     * bcrypt form that should be replaced by `hash(plain)` now that it matched.
     */
    verify(plain: string, stored: string | null | undefined): Promise<{
        valid: boolean;
        rehash: boolean;
    }>;
}
export declare function createPasswordHasher(bcrypt: BcryptLike, rounds?: number): PasswordHasher;
//# sourceMappingURL=hash.d.ts.map