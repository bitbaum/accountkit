// The menu, checked in a real browser — the part no unit test can see.
//
//   pnpm run demo && node test/browser.mjs
//
// Each check is something that shipped broken in at least one app:
//  - the trigger is at least 44px (Loki's was 36px)
//  - Escape closes the menu and gives focus back to the trigger
//  - arrow keys move between items
//  - a click outside closes it
//  - a broken photo falls back to initials
//  - no name and no photo draws a glyph, not a letter from the email
//  - a failing sign-out SAYS it failed (a dead sign-out is the worst case)
//  - nothing scrolls sideways at 390px, in light and dark, menu open
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("..", import.meta.url));
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
};
const server = createServer(async (req, res) => {
  const path = normalize(
    join(root, decodeURIComponent(new URL(req.url, "http://x").pathname)),
  );
  if (!path.startsWith(root)) return res.writeHead(403).end();
  try {
    const body = await readFile(path);
    res
      .writeHead(200, {
        "content-type": types[extname(path)] ?? "application/octet-stream",
      })
      .end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const base = `http://localhost:${server.address().port}/demo/index.html`;

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
  if (!ok) failures++;
};

const browser = await chromium.launch();
try {
  for (const scheme of ["light", "dark"]) {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      colorScheme: scheme,
    });
    await page.goto(base);
    const named = page.locator("#named .acct-trigger");
    await named.waitFor();

    const box = await named.boundingBox();
    check(
      box && box.width >= 44 && box.height >= 44,
      `[${scheme}] trigger is at least 44px (${box?.width}×${box?.height})`,
    );

    await named.click();
    const panel = page.locator("#named .acct-panel");
    check(
      await panel.isVisible(),
      `[${scheme}] clicking the trigger opens the menu`,
    );
    check(
      (await named.getAttribute("aria-expanded")) === "true",
      `[${scheme}] aria-expanded follows`,
    );

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    check(
      overflow <= 0,
      `[${scheme}] nothing scrolls sideways at 390px with the menu open (${overflow}px)`,
    );

    const panelBox = await panel.boundingBox();
    check(
      panelBox && panelBox.x >= 0 && panelBox.x + panelBox.width <= 390,
      `[${scheme}] the panel stays on screen`,
    );

    const rows = page.locator("#named .acct-row");
    const rowHeights = await rows.evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect().height),
    );
    check(
      rowHeights.every((h) => h >= 44),
      `[${scheme}] every row is at least 44px (${rowHeights.join(", ")})`,
    );

    await page.keyboard.press("Escape");
    check(!(await panel.isVisible()), `[${scheme}] Escape closes the menu`);
    const focusedTrigger = await page.evaluate(() =>
      document.activeElement?.classList.contains("acct-trigger"),
    );
    check(focusedTrigger, `[${scheme}] focus returns to the trigger`);

    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(base);
  const named = page.locator("#named .acct-trigger");
  await named.waitFor();

  // Keyboard: ArrowDown from the trigger opens and lands on the first item.
  await named.focus();
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(50);
  const first = await page.evaluate(() =>
    document.activeElement?.textContent?.trim(),
  );
  check(
    first === "Settings",
    `ArrowDown opens and focuses the first item (${first})`,
  );
  await page.keyboard.press("ArrowDown");
  const second = await page.evaluate(() =>
    document.activeElement?.textContent?.trim(),
  );
  check(second === "Projects", `ArrowDown moves to the next item (${second})`);
  await page.keyboard.press("End");
  const last = await page.evaluate(() =>
    document.activeElement?.textContent?.trim(),
  );
  check(last === "Sign out", `End jumps to Sign out (${last})`);

  // Outside click closes.
  await page.mouse.click(20, 400);
  check(
    !(await page.locator("#named .acct-panel").isVisible()),
    "a click outside closes the menu",
  );

  // No name, no photo: glyph.
  check(
    await page.locator("#anonymous .acct-glyph").isVisible(),
    "no name and no photo draws a glyph",
  );
  const anonText = (
    await page.locator("#anonymous .acct-trigger").innerText()
  ).trim();
  check(anonText === "", `and no letter taken from the email ("${anonText}")`);
  await page.locator("#anonymous .acct-trigger").click();
  const anonName = await page.locator("#anonymous .acct-name").innerText();
  check(
    anonName === "Account",
    `the menu never rebuilds a name from the email ("${anonName}")`,
  );
  await page.keyboard.press("Escape");

  // Broken photo falls back to initials.
  const failing = page.locator("#failing .acct-trigger");
  await page.waitForTimeout(200);
  check(
    (await failing.innerText()).trim() === "C",
    "a broken photo falls back to initials",
  );

  // Sign-out that fails says so and keeps the menu open.
  await failing.click();
  await page.locator("#failing .acct-signout").click();
  const alert = page.locator("#failing .acct-error");
  await alert.waitFor({ timeout: 2000 }).catch(() => {});
  check(await alert.isVisible(), "a failed sign-out says it failed");
  check(
    await page.locator("#failing .acct-panel").isVisible(),
    "and the menu stays open to try again",
  );

  // Sign-out that succeeds calls the app.
  await named.click();
  await page.locator("#named .acct-signout").click();
  await page.waitForTimeout(50);
  check(
    (await page.evaluate(() => document.body.dataset.signedOut)) === "yes",
    "Sign out calls the app's sign-out",
  );

  await page.close();

  // The sign-in error screen at 390px, both schemes: 44px targets, no
  // sideways scroll, and Try again goes to the restart, not home.
  for (const scheme of ["light", "dark"]) {
    const p = await browser.newPage({
      viewport: { width: 390, height: 844 },
      colorScheme: scheme,
    });
    await p.goto(base);
    const retry = p.locator("#signin-error .acct-signin-button");
    await retry.waitFor();
    const boxes = await p.$$eval(
      "#signin-error .acct-signin-button, #signin-error .acct-signin-home",
      (els) => els.map((e) => e.getBoundingClientRect().height),
    );
    check(
      boxes.length === 2 && boxes.every((h) => h >= 44),
      `[${scheme}] sign-in error: both actions are at least 44px (${boxes.join(", ")})`,
    );
    check(
      (await retry.getAttribute("href")) === "#restart",
      `[${scheme}] sign-in error: Try again restarts sign-in`,
    );
    check(
      (await p.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      )) <= 0,
      `[${scheme}] sign-in error: no sideways scroll at 390px`,
    );
    await p.close();
  }
  {
    // An Auth.js product passes only the two recovery calls. A failed network
    // call must leave the form usable, not stuck, and the retry must work.
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + "?adapter");
    const screen = page.locator("#auth-recovery-adapter");
    await screen.getByLabel("Email", { exact: true }).fill("ada@example.ch");
    const send = screen.getByRole("button", { name: "Email me a reset link" });
    await send.click();
    await screen.getByRole("alert").waitFor();
    check(
      await send.isEnabled(),
      "[adapter] a network failure on the request leaves the form usable",
    );
    check(
      (await screen.getByLabel("Email", { exact: true }).inputValue()) ===
        "ada@example.ch",
      "[adapter] the typed address is kept after a network failure",
    );
    await send.click();
    await screen.getByRole("status").waitFor();
    check(
      (await screen.getByRole("status").textContent()).includes(
        "If an account",
      ),
      "[adapter] the retry reaches the adapter and succeeds",
    );
    await page.goto(base + "?adapter&token=adapter-token");
    const fresh = page.locator("#auth-recovery-adapter");
    await fresh
      .getByLabel("New password", { exact: true })
      .fill("a new long password");
    const reset = fresh.getByRole("button", {
      name: "Reset password",
      exact: true,
    });
    await reset.click();
    await fresh.getByRole("alert").waitFor();
    check(
      await reset.isEnabled(),
      "[adapter] a network failure on the reset leaves the form usable",
    );
    await reset.click();
    await fresh.getByRole("status").waitFor();
    check(
      (await fresh.getByRole("status").textContent()).includes(
        "has been changed",
      ),
      "[adapter] the reset retry succeeds",
    );
    check(errors.length === 0, "[adapter] no runtime errors");
    await page.close();
  }
  for (const width of [320, 390, 1280]) {
    const recovery = await browser.newPage({
      viewport: { width, height: 844 },
    });
    const errors = [];
    recovery.on("pageerror", (error) => errors.push(error.message));
    await recovery.goto(base);
    const screen = recovery.locator("#auth-recovery");
    await screen.getByRole("button", { name: "Forgot your password?" }).click();
    await screen.getByLabel("Email", { exact: true }).fill("ada@example.ch");
    await screen.getByRole("button", { name: "Email me a reset link" }).click();
    await screen.getByRole("status").waitFor();
    check(
      (await screen.getByRole("status").textContent()).includes(
        "If an account",
      ),
      `[${width}] recovery response does not enumerate accounts`,
    );
    const sent = await recovery.evaluate(() =>
      JSON.parse(document.body.dataset.recoveryRequest),
    );
    check(
      new URL(sent.redirectTo).searchParams.get("next") === "/account",
      `[${width}] recovery preserves the return path`,
    );
    await recovery.goto(base + "?token=demo-reset-token&next=%2Faccount");
    await screen
      .getByLabel("New password", { exact: true })
      .fill("a new long password");
    await recovery.screenshot({
      path: `/tmp/accountkit-reset-${width}.png`,
      fullPage: true,
    });
    check(
      !new URL(recovery.url()).searchParams.has("token"),
      `[${width}] token removed from browser history`,
    );
    const resetField = screen.getByLabel("New password", { exact: true });
    check(
      (await resetField.getAttribute("type")) === "password" &&
        (await screen.getByLabel("Repeat new password").count()) === 0,
      `[${width}] reset has one new-password field, no repeat`,
    );
    await screen
      .getByRole("button", { name: "Show password", exact: true })
      .click();
    check(
      (await resetField.getAttribute("type")) === "text",
      `[${width}] the eye shows the new password`,
    );
    await screen
      .getByRole("button", { name: "Reset password", exact: true })
      .click();
    await screen.getByRole("status").waitFor();
    check(
      (await screen.getByRole("status").textContent()).includes(
        "has been changed",
      ),
      `[${width}] reset succeeds`,
    );
    const reset = await recovery.evaluate(() =>
      JSON.parse(document.body.dataset.recoveryReset),
    );
    check(
      reset.token === "demo-reset-token",
      `[${width}] retained token reaches reset endpoint`,
    );
    await screen.getByRole("button", { name: "Sign in", exact: true }).click();
    await screen.getByLabel("Password", { exact: true }).waitFor();
    check(
      await recovery.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `[${width}] recovery does not overflow`,
    );
    check(errors.length === 0, `[${width}] no runtime errors`);
    await recovery.screenshot({
      path: `/tmp/accountkit-recovery-${width}.png`,
      fullPage: true,
    });
    await recovery.close();
  }
  for (const width of [320, 390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    await page.goto(base + "?signup=1");
    const form = page.locator("#auth-signup");
    await form.getByLabel("Email", { exact: true }).fill("signup@example.test");
    await form
      .getByLabel("Password", { exact: true })
      .fill("a long test password");
    check(
      (await form.getByLabel("Repeat new password").count()) === 0,
      `[${width}] one password field, no repeat`,
    );
    const eye = form.getByRole("button", {
      name: "Show password",
      exact: true,
    });
    const eyeBox = await eye.boundingBox();
    const fieldBox = await form
      .getByLabel("Password", { exact: true })
      .boundingBox();
    check(
      eyeBox.height >= 44 &&
        eyeBox.width >= 44 &&
        eyeBox.x >= fieldBox.x &&
        eyeBox.x + eyeBox.width <= fieldBox.x + fieldBox.width + 1,
      `[${width}] the eye sits inside the field and is a full target`,
    );
    await eye.click();
    check(
      (await form
        .getByLabel("Password", { exact: true })
        .getAttribute("type")) === "text",
      `[${width}] password can be inspected`,
    );
    await form
      .getByRole("button", { name: "Hide password", exact: true })
      .click();
    check(
      (await form
        .getByLabel("Password", { exact: true })
        .getAttribute("type")) === "password",
      `[${width}] password can be hidden again`,
    );
    await form
      .getByRole("button", { name: "Create an account", exact: true })
      .click();
    await form.getByRole("status").waitFor();
    const request = await page.evaluate(() =>
      JSON.parse(document.body.dataset.signupRequest),
    );
    check(
      request.name === "" && request.password === "a long test password",
      `[${width}] an email and a password register, without a real name`,
    );
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `[${width}] registration has no horizontal overflow`,
    );
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures) {
  console.log(`\n${failures} browser check(s) failed`);
  process.exit(1);
}
console.log("\nall browser checks passed");
