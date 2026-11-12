// fetchAccountSummary: the browser half of a session on another origin.
// Whatever goes wrong, it resolves null, so a header shows "Sign in" and
// never throws.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchAccountSummary } from "../dist/index.js";

const URL_ = "https://loki.orangecat.ch/api/studio-session";
const json = (body, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

test("a GET that carries the cookies and skips every cache", async () => {
  const seen = [];
  const controller = new AbortController();
  await fetchAccountSummary(URL_, {
    signal: controller.signal,
    fetch: async (url, init) => {
      seen.push({ url, init });
      return json({ signedIn: false });
    },
  });
  assert.equal(seen.length, 1, "one request, no retries");
  assert.equal(seen[0].url, URL_);
  assert.equal(seen[0].init.method, "GET");
  assert.equal(seen[0].init.credentials, "include");
  assert.equal(seen[0].init.cache, "no-store");
  assert.ok(
    seen[0].init.signal instanceof AbortSignal,
    "a signal is always passed",
  );
  assert.equal(seen[0].init.signal.aborted, false);
  controller.abort();
  assert.equal(
    seen[0].init.signal.aborted,
    true,
    "the caller's abort reaches the request",
  );
});

test("with the timeout off, the caller's own signal is passed as it is", async () => {
  const controller = new AbortController();
  for (const timeoutMs of [0, -1]) {
    let passed;
    await fetchAccountSummary(URL_, {
      signal: controller.signal,
      timeoutMs,
      fetch: async (_url, init) => {
        passed = init.signal;
        return json({ signedIn: false });
      },
    });
    assert.equal(passed, controller.signal, String(timeoutMs));
  }
});

test("signed in and signed out bodies come back as they were sent", async () => {
  const signedIn = {
    signedIn: true,
    user: { name: "George", handle: "cato", image: null },
    owner: false,
    links: { signOut: "https://loki.orangecat.ch/sign-out" },
  };
  assert.deepEqual(
    await fetchAccountSummary(URL_, { fetch: async () => json(signedIn) }),
    signedIn,
  );
  assert.deepEqual(
    await fetchAccountSummary(URL_, {
      fetch: async () => json({ signedIn: false, links: { signIn: "/s" } }),
    }),
    { signedIn: false, links: { signIn: "/s" } },
  );
});

test("a network or CORS failure resolves null", async () => {
  assert.equal(
    await fetchAccountSummary(URL_, {
      fetch: async () => {
        throw new TypeError("Failed to fetch");
      },
    }),
    null,
  );
});

test("an abort resolves null", async () => {
  const controller = new AbortController();
  controller.abort();
  assert.equal(
    await fetchAccountSummary(URL_, {
      signal: controller.signal,
      fetch: async (_url, init) => {
        init.signal.throwIfAborted();
        return json({ signedIn: true });
      },
    }),
    null,
  );
});

test("a non-2xx status resolves null, even with a well-formed body", async () => {
  for (const status of [301, 401, 403, 404, 500, 503]) {
    assert.equal(
      await fetchAccountSummary(URL_, {
        fetch: async () => json({ signedIn: true }, status),
      }),
      null,
      String(status),
    );
  }
});

test("a body that is not JSON resolves null", async () => {
  for (const body of ["<!doctype html><p>Sign in</p>", "", "{signedIn:true"]) {
    assert.equal(
      await fetchAccountSummary(URL_, {
        fetch: async () => new Response(body, { status: 200 }),
      }),
      null,
      body,
    );
  }
});

test("JSON without a boolean signedIn resolves null", async () => {
  for (const body of [
    {},
    null,
    [],
    "signedIn",
    42,
    { signedIn: "true" },
    { signedIn: 1 },
    { user: { name: "x" } },
  ]) {
    assert.equal(
      await fetchAccountSummary(URL_, {
        fetch: async () => json(JSON.stringify(body)),
      }),
      null,
      JSON.stringify(body),
    );
  }
});

test("without an injected fetch it uses the global one, called attached", async () => {
  const original = globalThis.fetch;
  let attached = false;
  globalThis.fetch = async function (url, init) {
    attached = this === globalThis;
    assert.equal(init.credentials, "include");
    return json({ signedIn: false });
  };
  try {
    assert.deepEqual(await fetchAccountSummary(URL_), { signedIn: false });
    assert.ok(attached, "called with globalThis as this");
  } finally {
    globalThis.fetch = original;
  }
});

// The reviewer's case: an injected fetch that resolves to something that is
// not a Response used to reject ("Cannot read properties of undefined").
test("a fetch that resolves to something that is not a Response resolves null", async () => {
  for (const value of [
    undefined,
    null,
    42,
    "ok",
    {},
    { ok: "yes", json: async () => ({ signedIn: true }) },
    { ok: true },
    { ok: true, json: "not a function" },
    { ok: true, json: async () => ({ signedIn: "true" }) },
  ]) {
    assert.equal(
      await fetchAccountSummary(URL_, { fetch: async () => value }),
      null,
      String(JSON.stringify(value)),
    );
  }
});

test("a fetch that throws before it returns a promise resolves null", async () => {
  assert.equal(
    await fetchAccountSummary(URL_, {
      fetch: () => {
        throw new TypeError("sync");
      },
    }),
    null,
  );
});

// Never settles and ignores its signal: the worst a server or an injected
// fetch can do. Each case records whether the request's signal was aborted.
function hanging() {
  const seen = {};
  return {
    seen,
    fetch: (_url, init) => {
      seen.signal = init.signal;
      return new Promise(() => {});
    },
  };
}

test("a fetch that never settles resolves null once timeoutMs passes", async () => {
  const h = hanging();
  const started = Date.now();
  assert.equal(
    await fetchAccountSummary(URL_, { fetch: h.fetch, timeoutMs: 30 }),
    null,
  );
  const took = Date.now() - started;
  assert.ok(took >= 25 && took < 2000, `resolved after ${took}ms`);
  assert.equal(h.seen.signal.aborted, true, "the request itself is aborted");
});

test("a body that never finishes resolves null once timeoutMs passes", async () => {
  const stalled = {
    ok: true,
    json: () => new Promise(() => {}),
  };
  assert.equal(
    await fetchAccountSummary(URL_, {
      fetch: async () => stalled,
      timeoutMs: 30,
    }),
    null,
  );
});

test("the default timeout is 8000ms, and 0 or less turns it off", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = hanging();
  let settled = false;
  const p = fetchAccountSummary(URL_, { fetch: h.fetch }).then((v) => {
    settled = true;
    return v;
  });
  await Promise.resolve();
  t.mock.timers.tick(7999);
  await Promise.resolve();
  assert.equal(settled, false, "still waiting at 7999ms");
  t.mock.timers.tick(1);
  assert.equal(await p, null);

  for (const timeoutMs of [0, -5]) {
    const off = hanging();
    let done = false;
    fetchAccountSummary(URL_, { fetch: off.fetch, timeoutMs }).then(
      () => (done = true),
    );
    t.mock.timers.tick(60_000);
    await new Promise((r) => setImmediate(r));
    assert.equal(done, false, `timeoutMs ${timeoutMs}: no timer`);
    assert.equal(off.seen.signal, undefined, "no signal of its own");
  }
});

test("the caller's abort still resolves null while a timeout is armed", async () => {
  const h = hanging();
  const controller = new AbortController();
  const p = fetchAccountSummary(URL_, {
    fetch: h.fetch,
    signal: controller.signal,
    timeoutMs: 60_000,
  });
  await Promise.resolve();
  controller.abort();
  assert.equal(await p, null);
  assert.equal(h.seen.signal.aborted, true);
});

test("without AbortSignal.any the signals are combined by hand", async () => {
  const original = Object.getOwnPropertyDescriptor(AbortSignal, "any");
  Object.defineProperty(AbortSignal, "any", {
    value: undefined,
    configurable: true,
  });
  try {
    // The timeout fires.
    const h1 = hanging();
    const c1 = new AbortController();
    assert.equal(
      await fetchAccountSummary(URL_, {
        fetch: h1.fetch,
        signal: c1.signal,
        timeoutMs: 20,
      }),
      null,
    );
    assert.equal(h1.seen.signal.aborted, true);
    assert.notEqual(h1.seen.signal, c1.signal);

    // The caller aborts.
    const h2 = hanging();
    const c2 = new AbortController();
    const p = fetchAccountSummary(URL_, {
      fetch: h2.fetch,
      signal: c2.signal,
      timeoutMs: 60_000,
    });
    await Promise.resolve();
    c2.abort();
    assert.equal(await p, null);
    assert.equal(h2.seen.signal.aborted, true);

    // A good answer still comes through.
    assert.deepEqual(
      await fetchAccountSummary(URL_, {
        signal: new AbortController().signal,
        fetch: async () => json({ signedIn: false }),
      }),
      { signedIn: false },
    );
  } finally {
    Object.defineProperty(AbortSignal, "any", original);
  }
});

test("an Infinity or a huge timeoutMs does not fire at once", async () => {
  for (const timeoutMs of [Infinity, 2 ** 40]) {
    const h = hanging();
    const controller = new AbortController();
    let done = false;
    const p = fetchAccountSummary(URL_, {
      fetch: h.fetch,
      timeoutMs,
      signal: controller.signal,
    }).then(() => (done = true));
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(
      done,
      false,
      `timeoutMs ${timeoutMs} still waiting after 30ms`,
    );
    assert.equal(h.seen.signal.aborted, false);
    // Abort, so a long timer does not hold the test process open.
    controller.abort();
    await p;
  }
});
