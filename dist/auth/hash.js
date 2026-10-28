import { createHash } from "node:crypto";
export const PASSWORD_HASH_PREFIX = "$bs1$";
export const BCRYPT_ROUNDS = 12;
/** 44 characters whatever the password's length: always under bcrypt's 72 bytes. */
const digest = (plain) => createHash("sha256").update(plain, "utf8").digest("base64");
export function createPasswordHasher(bcrypt, rounds = BCRYPT_ROUNDS) {
    return {
        async hash(plain) {
            return PASSWORD_HASH_PREFIX + (await bcrypt.hash(digest(plain), rounds));
        },
        async verify(plain, stored) {
            if (typeof plain !== "string" || !stored)
                return { valid: false, rehash: false };
            if (stored.startsWith(PASSWORD_HASH_PREFIX)) {
                const valid = await bcrypt.compare(digest(plain), stored.slice(PASSWORD_HASH_PREFIX.length));
                return { valid, rehash: false };
            }
            const valid = await bcrypt.compare(plain, stored);
            return { valid, rehash: valid };
        },
    };
}
//# sourceMappingURL=hash.js.map