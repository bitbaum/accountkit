import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { pushSchema } from "drizzle-kit/api";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hex } from "@scure/base";
import { createAuthInstance } from "../dist/auth/server.js";
import { signInMethods } from "../dist/auth/methods.js";
import {
  lnurlDecode,
  lnurlEncode,
  verifyLightningSignature,
} from "../dist/auth/lightning.js";
import * as schema from "../dist/auth/schema.js";
import { otpForURI } from "./totp-helper.js";

// LUD-01's own example (https://github.com/lnurl/luds/blob/luds/01.md).
const LUD01_LNURL =
  "LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS";
const LUD01_URL =
  "https://service.com/api?q=3fc3645b439ce8e7f2553a69e5267081d96dcd340693afabe04be7b0ccd178df";

// A signature made by an independent implementation, OpenSSL 3.0:
//   openssl ecparam -name secp256k1 -genkey -noout -out key.pem
//   openssl rand 32 > k1.bin
//   openssl pkeyutl -sign -inkey key.pem -in k1.bin -out sig.der   (k1 signed as a digest, DER)
//   openssl ec -in key.pem -pubout -conv_form compressed -outform DER | tail -c 33
// and checked with `openssl pkeyutl -verify` before it was copied here.
const OPENSSL = {
  k1: "c70ed22021cbb76b6c7d0d12c4b6cc71c0dee4908f1e96acd92c0f1374234cec",
  key: "02c680a1361542547471b98c51ec72536e31c045377d37bfb369b09c06243b4aa2",
  sig: "3045022100a6a3d49449460aaf63ee53c6a4c80e9cd306ef0d139d2a317cd769b4bdc55de802206dc1d035276fb448ec132a3d2fe8d450c7afba6f54cd0046dc08c35e5aa17a84",
};

test("LNURL bech32 matches LUD-01's example both ways", () => {
  assert.equal(lnurlDecode(LUD01_LNURL), LUD01_URL);
  assert.equal(lnurlEncode(LUD01_URL), LUD01_LNURL);
});

test("a LUD-04 signature made by OpenSSL verifies; anything else does not", () => {
  assert.equal(
    verifyLightningSignature(OPENSSL.k1, OPENSSL.sig, OPENSSL.key),
    true,
  );
  const other = OPENSSL.k1.replace(/^c7/, "c8");
  assert.equal(
    verifyLightningSignature(other, OPENSSL.sig, OPENSSL.key),
    false,
    "another challenge",
  );
  const wrongKey = hex.encode(
    secp256k1.getPublicKey(secp256k1.utils.randomSecretKey(), true),
  );
  assert.equal(
    verifyLightningSignature(OPENSSL.k1, OPENSSL.sig, wrongKey),
    false,
    "another key",
  );
  assert.equal(
    verifyLightningSignature(OPENSSL.k1, "zz", OPENSSL.key),
    false,
    "not hex",
  );
  assert.equal(
    verifyLightningSignature("00", OPENSSL.sig, OPENSSL.key),
    false,
    "short k1",
  );
  assert.equal(
    verifyLightningSignature(OPENSSL.k1, OPENSSL.sig, "02" + "00".repeat(32)),
    false,
    "not a point",
  );
});

test("Lightning login is off unless the deployment opts in", () => {
  assert.equal(signInMethods({}, true).lightning, false);
  assert.equal(
    signInMethods({ ACCOUNTKIT_LIGHTNING: "1" }, true).lightning,
    true,
  );
});

const site = {
  url: "https://lightning.example.test",
  title: "Lightning fixture",
  slug: "ln",
};

async function fixture(env = { ACCOUNTKIT_LIGHTNING: "1" }) {
  const pg = new PGlite();
  const db = drizzle(pg, { schema: schema.authSchema });
  await (await pushSchema(schema.authSchema, db)).apply();
  const auth = createAuthInstance({
    site,
    database: db,
    env: {
      NODE_ENV: "test",
      BETTER_AUTH_SECRET:
        "synthetic-lightning-fixture-secret-more-than-32-chars",
      ...env,
    },
    mail: { configured: false, send: async () => {} },
  });
  const browser = () => {
    const cookies = new Map();
    const call = async (path, body, { origin = true } = {}) => {
      const response = await auth.handler(
        new Request(new URL(path, site.url), {
          method: body === undefined ? "GET" : "POST",
          headers: {
            ...(origin ? { origin: site.url } : {}),
            "content-type": "application/json",
            cookie: [...cookies].map(([n, v]) => `${n}=${v}`).join("; "),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
      for (const header of response.headers.getSetCookie()) {
        const pair = header.split(";")[0],
          i = pair.indexOf("=");
        cookies.set(pair.slice(0, i), pair.slice(i + 1));
      }
      return response;
    };
    return {
      call,
      post: (path, body = {}) => call("/api/auth" + path, body),
      session: () => call("/api/auth/get-session").then((r) => r.json()),
    };
  };
  // The wallet: its own key, signs k1 exactly as LUD-04 says, calls back.
  const wallet = (secretKey = secp256k1.utils.randomSecretKey()) => ({
    key: hex.encode(secp256k1.getPublicKey(secretKey, true)),
    async approve(lnurl, tamper = false) {
      const url = new URL(lnurlDecode(lnurl));
      const k1 = url.searchParams.get("k1");
      const signed = secp256k1.sign(hex.decode(k1), secretKey, {
        prehash: false,
        format: "der",
      });
      url.searchParams.set("sig", hex.encode(signed));
      url.searchParams.set(
        "key",
        tamper
          ? hex.encode(
              secp256k1.getPublicKey(secp256k1.utils.randomSecretKey(), true),
            )
          : this.key,
      );
      const response = await auth.handler(new Request(url)); // no Origin, no cookie: a wallet
      return { status: response.status, body: await response.json() };
    },
  });
  return { pg, auth, browser, wallet };
}

test("a wallet signs in, and the same wallet signs in to the same person again", async () => {
  const f = await fixture();
  try {
    const page = f.browser();
    const w = f.wallet();
    const started = await (await page.post("/lightning/start", {})).json();
    assert.match(started.lnurl, /^LNURL1[0-9A-Z]+$/);
    const callback = new URL(lnurlDecode(started.lnurl));
    assert.equal(
      callback.origin + callback.pathname,
      `${site.url}/api/auth/lightning/callback`,
    );
    assert.equal(callback.searchParams.get("tag"), "login");
    assert.deepEqual(await (await page.post("/sign-in/lightning")).json(), {
      status: "pending",
    });
    assert.deepEqual(await w.approve(started.lnurl), {
      status: 200,
      body: { status: "OK" },
    });
    const signed = await (await page.post("/sign-in/lightning")).json();
    assert.equal(signed.status, "signed-in");
    const who = await page.session();
    assert.match(
      who.user.email,
      /@lightning\.invalid$/,
      "a key is never an email",
    );
    const id = who.user.id;
    const ctx = await f.auth.$context;
    const accounts = await ctx.internalAdapter.findAccounts(id);
    assert.deepEqual(
      accounts.map((a) => [a.providerId, a.accountId]),
      [["lightning", w.key]],
    );
    assert.equal(
      (await w.approve(started.lnurl)).body.status,
      "ERROR",
      "a challenge is used once",
    );

    await page.post("/sign-out");
    const again = await (await page.post("/lightning/start", {})).json();
    await w.approve(again.lnurl);
    await page.post("/sign-in/lightning");
    assert.equal((await page.session()).user.id, id);
  } finally {
    await f.pg.close();
  }
});

test("only the browser that showed the code can finish it; a wrong signature is refused", async () => {
  const f = await fixture();
  try {
    const page = f.browser();
    const onlooker = f.browser();
    const w = f.wallet();
    const started = await (await page.post("/lightning/start", {})).json();
    const forged = await w.approve(started.lnurl, true);
    assert.equal(forged.status, 400);
    assert.equal(forged.body.status, "ERROR");
    await w.approve(started.lnurl);
    const stolen = await onlooker.post("/sign-in/lightning");
    assert.equal(stolen.status, 400);
    assert.equal((await stolen.json()).code, "LIGHTNING_NOT_STARTED");
    assert.equal(await onlooker.session(), null);
    assert.equal(
      (await (await page.post("/sign-in/lightning")).json()).status,
      "signed-in",
    );
  } finally {
    await f.pg.close();
  }
});

test("an enabled second factor still applies to a wallet sign-in", async () => {
  const f = await fixture();
  try {
    const page = f.browser();
    const w = f.wallet();
    let s = await (await page.post("/lightning/start", {})).json();
    await w.approve(s.lnurl);
    await page.post("/sign-in/lightning");
    const id = (await page.session()).user.id;
    const setup = await (await page.post("/two-factor/enable", {})).json();
    assert.equal(
      (
        await page.post("/two-factor/verify-totp", {
          code: otpForURI(setup.totpURI),
        })
      ).status,
      200,
    );
    await page.post("/sign-out");
    s = await (await page.post("/lightning/start", {})).json();
    await w.approve(s.lnurl);
    const challenged = await (await page.post("/sign-in/lightning")).json();
    assert.equal(challenged.twoFactorRedirect, true);
    assert.equal(
      await page.session(),
      null,
      "the wallet alone is not a session",
    );
    assert.equal(
      (
        await page.post("/two-factor/verify-totp", {
          code: otpForURI(setup.totpURI),
        })
      ).status,
      200,
    );
    assert.equal((await page.session()).user.id, id);
  } finally {
    await f.pg.close();
  }
});

test("a signed-in person adds a wallet; a wallet that belongs to someone else is refused", async () => {
  const f = await fixture();
  try {
    const ada = f.browser();
    const bob = f.browser();
    const w = f.wallet();
    assert.equal(
      (
        await ada.post("/sign-up/email", {
          email: "ada@example.test",
          password: "a synthetic phrase",
          name: "",
        })
      ).status,
      200,
    );
    const adaId = (await ada.session()).user.id;
    let s = await (
      await ada.post("/lightning/start", { purpose: "link" })
    ).json();
    assert.deepEqual(await (await ada.post("/lightning/link")).json(), {
      status: "pending",
    });
    await w.approve(s.lnurl);
    assert.deepEqual(await (await ada.post("/lightning/link")).json(), {
      status: "linked",
    });
    const anon = f.browser();
    assert.equal(
      (await anon.post("/lightning/start", { purpose: "link" })).status,
      401,
      "linking needs a session",
    );

    assert.equal(
      (
        await bob.post("/sign-up/email", {
          email: "bob@example.test",
          password: "another phrase",
          name: "",
        })
      ).status,
      200,
    );
    s = await (await bob.post("/lightning/start", { purpose: "link" })).json();
    await w.approve(s.lnurl);
    const taken = await bob.post("/lightning/link");
    assert.equal(taken.status, 409);
    assert.equal((await taken.json()).code, "LIGHTNING_KEY_TAKEN");

    await ada.post("/sign-out");
    s = await (await ada.post("/lightning/start", {})).json();
    await w.approve(s.lnurl);
    await ada.post("/sign-in/lightning");
    assert.equal(
      (await ada.session()).user.id,
      adaId,
      "the linked wallet signs in to Ada",
    );
  } finally {
    await f.pg.close();
  }
});

test("without the opt-in nothing is mounted", async () => {
  const f = await fixture({});
  try {
    const page = f.browser();
    assert.equal((await page.post("/lightning/start", {})).status, 404);
    assert.equal(
      (
        await page.call(
          `/api/auth/lightning/callback?k1=${OPENSSL.k1}&sig=${OPENSSL.sig}&key=${OPENSSL.key}`,
        )
      ).status,
      404,
    );
  } finally {
    await f.pg.close();
  }
});
