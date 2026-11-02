import type { BetterAuthPlugin } from "better-auth";
/**
 * Lightning login: LNURL-auth (LUD-04, https://github.com/lnurl/luds/blob/luds/04.md).
 *
 * The page shows a QR code (and a lightning: link for a wallet on the same
 * device). The person's own Lightning wallet signs a one-time challenge with a
 * key it derives for this site, and calls back with the signature. Nothing is
 * paid, no third party is asked, no key is held by us: the signed key is the
 * identity, as a sign-in method (`providerId: "lightning"`, `accountId` the
 * 33-byte linking key in hex), never an email.
 *
 * 1. POST /lightning/start   → { k1, lnurl }; the browser that asked gets a
 *    signed cookie naming k1, so only it can finish this sign-in (a k1 read
 *    off the screen by someone else is useless to them).
 * 2. GET  /lightning/callback?tag=login&k1&sig&key  (the wallet) → verifies the
 *    DER secp256k1 signature of k1 under key; k1 is marked signed, once.
 * 3. POST /sign-in/lightning (the page, polling) → "pending" until signed,
 *    then the session: the person whose sign-in method this key is, or a new
 *    person with it. A second factor applies as everywhere (./factor).
 * 4. POST /lightning/link (signed in) → adds the key to the signed-in person.
 *
 * A challenge lives five minutes and is used once.
 */
export declare const LIGHTNING_PROVIDER_ID = "lightning";
export declare const LIGHTNING_SECONDS: number;
/** bech32 `lnurl…` for a URL (LUD-01), uppercase so the QR code is smaller. */
export declare function lnurlEncode(url: string): string;
export declare function lnurlDecode(lnurl: string): string;
/**
 * LUD-04's check: `sig` is a DER secp256k1 signature of the 32 bytes of `k1`
 * (signed as they are, not hashed again) under the compressed or uncompressed
 * public key `key`. High-S signatures are accepted: k1 is single-use, so
 * malleability gains nothing, and some wallets do not normalise.
 */
export declare function verifyLightningSignature(k1: string, sig: string, key: string): boolean;
export declare function lightningPlugin(site: {
    url: string;
}): BetterAuthPlugin;
//# sourceMappingURL=lightning.d.ts.map