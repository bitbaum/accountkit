import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bech32, hex } from "@scure/base";
import {
  APIError,
  createAuthEndpoint,
  getSessionFromCtx,
  originCheckMiddleware,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth";
import { z } from "zod";
import { placeholderEmail } from "./methods.js";

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
export const LIGHTNING_PROVIDER_ID = "lightning";
export const LIGHTNING_SECONDS = 5 * 60;
const COOKIE = "lightning_k1";

type Challenge =
  | { state: "pending"; purpose: "sign-in" | "link" }
  | { state: "signed"; purpose: "sign-in" | "link"; key: string };

const identifier = (k1: string) => `lightning:${k1}`;

/** bech32 `lnurl…` for a URL (LUD-01), uppercase so the QR code is smaller. */
export function lnurlEncode(url: string): string {
  return bech32
    .encode("lnurl", bech32.toWords(new TextEncoder().encode(url)), false)
    .toUpperCase();
}

export function lnurlDecode(lnurl: string): string {
  const { words } = bech32.decode(
    lnurl.toLowerCase() as `${string}1${string}`,
    false,
  );
  return new TextDecoder().decode(bech32.fromWords(words));
}

const HEX = /^[0-9a-f]+$/i;

/**
 * LUD-04's check: `sig` is a DER secp256k1 signature of the 32 bytes of `k1`
 * (signed as they are, not hashed again) under the compressed or uncompressed
 * public key `key`. High-S signatures are accepted: k1 is single-use, so
 * malleability gains nothing, and some wallets do not normalise.
 */
export function verifyLightningSignature(
  k1: string,
  sig: string,
  key: string,
): boolean {
  if (k1.length !== 64 || !HEX.test(k1)) return false;
  if (!HEX.test(sig) || sig.length < 16 || sig.length > 146) return false;
  if (!HEX.test(key) || (key.length !== 66 && key.length !== 130)) return false;
  try {
    return secp256k1.verify(hex.decode(sig), hex.decode(k1), hex.decode(key), {
      prehash: false,
      format: "der",
      lowS: false,
    });
  } catch {
    return false;
  }
}

/** The linking key as stored: compressed, lowercase hex. */
function normalKey(key: string): string {
  return hex.encode(
    secp256k1.Point.fromBytes(hex.decode(key.toLowerCase())).toBytes(true),
  );
}

function read(value: string | undefined): Challenge | null {
  try {
    const parsed = JSON.parse(value ?? "") as Challenge;
    return parsed && (parsed.state === "pending" || parsed.state === "signed")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function lightningPlugin(site: { url: string }): BetterAuthPlugin {
  const callbackBase = `${site.url.replace(/\/+$/, "")}/api/auth/lightning/callback`;

  return {
    id: "accountkit-lightning",
    endpoints: {
      lightningStart: createAuthEndpoint(
        "/lightning/start",
        {
          method: "POST",
          use: [originCheckMiddleware],
          body: z.object({ purpose: z.enum(["sign-in", "link"]).optional() }),
        },
        async (ctx) => {
          const purpose = ctx.body.purpose ?? "sign-in";
          if (purpose === "link" && !(await getSessionFromCtx(ctx)))
            throw new APIError("UNAUTHORIZED");
          const k1 = hex.encode(crypto.getRandomValues(new Uint8Array(32)));
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: identifier(k1),
            value: JSON.stringify({ state: "pending", purpose }),
            expiresAt: new Date(Date.now() + LIGHTNING_SECONDS * 1000),
          });
          const cookie = ctx.context.createAuthCookie(COOKIE, {
            maxAge: LIGHTNING_SECONDS,
          });
          await ctx.setSignedCookie(
            cookie.name,
            k1,
            ctx.context.secret,
            cookie.attributes,
          );
          const url = `${callbackBase}?tag=login&k1=${k1}&action=${purpose === "link" ? "link" : "login"}`;
          return ctx.json({ k1, lnurl: lnurlEncode(url) });
        },
      ),

      // Called by the wallet, not the page: LUD-04 answers in its own JSON.
      lightningCallback: createAuthEndpoint(
        "/lightning/callback",
        {
          method: "GET",
          query: z.object({
            tag: z.string().optional(),
            k1: z.string().max(64),
            sig: z.string().max(146),
            key: z.string().max(130),
            action: z.string().optional(),
          }),
        },
        async (ctx) => {
          // LUD-04's own error shape, with a 400 the wallet can also read.
          const refuse = (reason: string) =>
            new Response(JSON.stringify({ status: "ERROR", reason }), {
              status: 400,
              headers: { "content-type": "application/json" },
            });
          const { k1, sig, key } = ctx.query;
          if (!verifyLightningSignature(k1, sig, key))
            return refuse("The signature does not match this challenge.");
          const id = identifier(k1.toLowerCase());
          const found =
            await ctx.context.internalAdapter.findVerificationValue(id);
          const challenge = read(found?.value);
          if (!found || !challenge || found.expiresAt < new Date())
            return refuse("This sign-in has expired. Ask for a new code.");
          if (challenge.state !== "pending")
            return refuse("This sign-in was already used.");
          await ctx.context.internalAdapter.updateVerificationByIdentifier(id, {
            value: JSON.stringify({
              state: "signed",
              purpose: challenge.purpose,
              key: normalKey(key),
            }),
          });
          return ctx.json({ status: "OK" });
        },
      ),

      signInLightning: createAuthEndpoint(
        "/sign-in/lightning",
        { method: "POST", use: [originCheckMiddleware], body: z.object({}) },
        async (ctx) => {
          const claimed = await claim(ctx, "sign-in");
          if ("pending" in claimed) return ctx.json({ status: "pending" });
          const adapter = ctx.context.internalAdapter;
          const owner = await adapter.findAccountOwnerByKey({
            providerId: LIGHTNING_PROVIDER_ID,
            accountId: claimed.key,
          });
          // A sign-in method left behind by a deleted person is not an owner.
          if (owner?.kind === "orphaned")
            await adapter.deleteAccount(owner.account.id);
          let user = owner?.kind === "owned" ? owner.user : null;
          if (!user) {
            const created = await adapter.createOAuthUser(
              {
                email: placeholderEmail(LIGHTNING_PROVIDER_ID, claimed.key),
                emailVerified: false,
                name: "",
              },
              { providerId: LIGHTNING_PROVIDER_ID, accountId: claimed.key },
            );
            user = created.user;
          }
          const session = await adapter.createSession(user.id);
          if (!session)
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "Unable to create session",
            });
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ status: "signed-in", user: { id: user.id } });
        },
      ),

      linkLightning: createAuthEndpoint(
        "/lightning/link",
        { method: "POST", use: [originCheckMiddleware], body: z.object({}) },
        async (ctx) => {
          const current = await getSessionFromCtx(ctx);
          if (!current) throw new APIError("UNAUTHORIZED");
          const claimed = await claim(ctx, "link");
          if ("pending" in claimed) return ctx.json({ status: "pending" });
          const adapter = ctx.context.internalAdapter;
          const owner = await adapter.findAccountOwnerByKey({
            providerId: LIGHTNING_PROVIDER_ID,
            accountId: claimed.key,
          });
          if (owner?.kind === "orphaned")
            await adapter.deleteAccount(owner.account.id);
          const ownerId = owner?.kind === "owned" ? owner.user.id : null;
          if (ownerId && ownerId !== current.user.id)
            throw new APIError("CONFLICT", {
              message: "This wallet already signs in to another account.",
              code: "LIGHTNING_KEY_TAKEN",
            });
          if (!ownerId)
            await adapter.linkAccount({
              userId: current.user.id,
              providerId: LIGHTNING_PROVIDER_ID,
              accountId: claimed.key,
            });
          return ctx.json({ status: "linked" });
        },
      ),
    },
  };

  /** The browser's own challenge, once it is signed; consumed exactly once. */
  async function claim(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctx: any,
    purpose: "sign-in" | "link",
  ): Promise<{ pending: true } | { key: string }> {
    const cookie = ctx.context.createAuthCookie(COOKIE);
    const k1 = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
    if (!k1 || typeof k1 !== "string")
      throw new APIError("BAD_REQUEST", {
        message: "No Lightning sign-in was started in this browser.",
        code: "LIGHTNING_NOT_STARTED",
      });
    const id = identifier(k1);
    const adapter = ctx.context.internalAdapter;
    const found = await adapter.findVerificationValue(id);
    const challenge = read(found?.value);
    if (
      !found ||
      !challenge ||
      found.expiresAt < new Date() ||
      challenge.purpose !== purpose
    )
      throw new APIError("BAD_REQUEST", {
        message: "This sign-in has expired. Ask for a new code.",
        code: "LIGHTNING_EXPIRED",
      });
    if (challenge.state === "pending") return { pending: true };
    const consumed = await adapter.consumeVerificationValue(id);
    if (!consumed)
      throw new APIError("BAD_REQUEST", {
        message: "This sign-in was already used.",
        code: "LIGHTNING_EXPIRED",
      });
    ctx.setCookie(cookie.name, "", { ...cookie.attributes, maxAge: 0 });
    return { key: challenge.key };
  }
}
