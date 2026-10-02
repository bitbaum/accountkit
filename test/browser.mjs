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
} finally {
  await browser.close();
  server.close();
}

if (failures) {
  console.log(`\n${failures} browser check(s) failed`);
  process.exit(1);
}
console.log("\nall browser checks passed");
