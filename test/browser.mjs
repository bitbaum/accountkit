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
//  - no button label cuts a hyphenated word across two lines (evig's
//    "per E- / Mail schicken" at 390px), in every language AccountKit ships.
//    chatkit's findBrokenWords exempts a break beside a hyphen by design, so
//    this check measures exactly that case.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  AUTH_LABEL_LOCALES,
  authLabelsFor,
} from "../dist/auth/translations.js";

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

// CHROMIUM_PATH: a machine whose Chromium is not the one this Playwright
// version downloads (a sandbox with a pre-installed browser) points at it.
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {},
);
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

  // The trigger is not always last in its row. Bitbaum's header puts its
  // menu button after it, and at 390px the panel ran 112px off the left
  // edge: pinned to the trigger's edge, it only fits while nothing follows.
  // Off the LEFT edge is invisible to a scrollWidth check (nothing scrolls to
  // negative x), so the panel's own box is measured.
  for (const width of [320, 390]) {
    for (const scheme of ["light", "dark"]) {
      const page = await browser.newPage({
        viewport: { width, height: 844 },
        colorScheme: scheme,
      });
      await page.goto(base);
      for (const id of [
        "row-followed-end",
        "row-followed-start",
        "row-preceded-end",
        "row-preceded-start",
      ]) {
        const trigger = page.locator(`#${id} .acct-trigger`);
        await trigger.waitFor();
        await trigger.click();
        const panel = page.locator(`#${id} .acct-panel`);
        await panel.waitFor();
        const placed = await panel.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return {
            left: Math.round(r.left * 10) / 10,
            right: Math.round(r.right * 10) / 10,
            inner: window.innerWidth,
            scroll: document.documentElement.scrollWidth - window.innerWidth,
          };
        });
        check(
          placed.left >= 0 && placed.right <= placed.inner,
          `[${width} ${scheme}] #${id}: the open panel is inside the viewport (left ${placed.left}, right ${placed.right}, width ${placed.inner})`,
        );
        check(
          placed.scroll <= 0,
          `[${width} ${scheme}] #${id}: nothing scrolls sideways with the panel open (${placed.scroll}px)`,
        );
        await page.keyboard.press("Escape");
        check(
          !(await panel.isVisible()),
          `[${width} ${scheme}] #${id}: Escape closes the menu`,
        );
      }

      // The same rows read right to left. The panel is moved on the edge it
      // is pinned by, and in a right-to-left page that edge is the other one:
      // a move with the wrong sign pushes the panel further off the screen.
      await page.evaluate(() =>
        document.documentElement.setAttribute("dir", "rtl"),
      );
      for (const id of [
        "row-followed-end",
        "row-followed-start",
        "row-preceded-end",
        "row-preceded-start",
      ]) {
        const trigger = page.locator(`#${id} .acct-trigger`);
        await trigger.click();
        const panel = page.locator(`#${id} .acct-panel`);
        await panel.waitFor();
        const placed = await panel.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return {
            left: Math.round(r.left * 10) / 10,
            right: Math.round(r.right * 10) / 10,
            inner: window.innerWidth,
            wide: document.documentElement.scrollWidth - window.innerWidth,
          };
        });
        check(
          placed.left >= 0 && placed.right <= placed.inner && placed.wide <= 0,
          `[${width} ${scheme} rtl] #${id}: the open panel is inside the viewport and nothing scrolls sideways (left ${placed.left}, right ${placed.right}, width ${placed.inner}, ${placed.wide}px over)`,
        );
        await page.keyboard.press("Escape");
      }
      await page.evaluate(() =>
        document.documentElement.removeAttribute("dir"),
      );

      // Where the trigger IS last, the panel looks exactly as it always did:
      // its end edge on the trigger's end edge, not moved.
      for (const id of ["named", "row-preceded-end"]) {
        const trigger = page.locator(`#${id} .acct-trigger`);
        await trigger.click();
        const panel = page.locator(`#${id} .acct-panel`);
        await panel.waitFor();
        const t = await trigger.boundingBox();
        const p = await panel.boundingBox();
        check(
          t && p && Math.abs(t.x + t.width - (p.x + p.width)) < 0.5,
          `[${width} ${scheme}] #${id}: trigger last, the panel still ends on the trigger's edge (${t && t.x + t.width} vs ${p && p.x + p.width})`,
        );
        await page.keyboard.press("Escape");
      }

      // The keyboard is unchanged where the panel had to move.
      const moved = page.locator("#row-followed-end .acct-trigger");
      await moved.focus();
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(50);
      const firstItem = await page.evaluate(() =>
        document.activeElement?.textContent?.trim(),
      );
      check(
        firstItem === "Settings",
        `[${width} ${scheme}] a moved panel: ArrowDown opens on the first item (${firstItem})`,
      );
      await page.keyboard.press("End");
      const lastItem = await page.evaluate(() =>
        document.activeElement?.textContent?.trim(),
      );
      check(
        lastItem === "Sign out",
        `[${width} ${scheme}] a moved panel: End reaches Sign out (${lastItem})`,
      );
      await page.keyboard.press("Escape");
      const backOnTrigger = await page.evaluate(
        () =>
          document.activeElement?.closest("#row-followed-end") !== null &&
          document.activeElement?.classList.contains("acct-trigger"),
      );
      check(
        backOnTrigger,
        `[${width} ${scheme}] a moved panel: Escape gives focus back to the trigger`,
      );

      // The row changes while the menu is open, with no window resize: one
      // more 44px control lands after the trigger (a font loading, a button
      // appearing). The trigger moves; the panel must follow it back inside.
      for (const id of ["row-followed-end", "row-followed-start"]) {
        const trigger = page.locator(`#${id} .acct-trigger`);
        await trigger.click();
        const panel = page.locator(`#${id} .acct-panel`);
        await panel.waitFor();
        const placed = await page.evaluate(async (rowId) => {
          const header = document.getElementById(rowId).parentElement;
          const extra = document.createElement("button");
          extra.type = "button";
          extra.className = "demo-control demo-added";
          extra.setAttribute("aria-label", "Added");
          extra.textContent = "+";
          header.append(extra);
          const frame = () =>
            new Promise((r) => requestAnimationFrame(() => r()));
          await frame();
          await frame();
          const p = document.querySelector(`#${rowId} .acct-panel`);
          const r = p.getBoundingClientRect();
          const t = document
            .querySelector(`#${rowId} .acct-trigger`)
            .getBoundingClientRect();
          const out = {
            left: Math.round(r.left * 10) / 10,
            right: Math.round(r.right * 10) / 10,
            inner: window.innerWidth,
            triggerRight: Math.round(t.right),
          };
          extra.remove();
          return out;
        }, id);
        check(
          placed.left >= 0 && placed.right <= placed.inner,
          `[${width} ${scheme}] #${id}: a control added while open, the panel is still inside the viewport (left ${placed.left}, right ${placed.right}, width ${placed.inner}, trigger right ${placed.triggerRight})`,
        );
        await page.keyboard.press("Escape");
      }

      // A control already in the row grows (a label appears, a font loads):
      // no node is added and the window does not resize; only a
      // ResizeObserver sees it.
      {
        const id = "row-followed-end";
        await page.locator(`#${id} .acct-trigger`).click();
        await page.locator(`#${id} .acct-panel`).waitFor();
        const placed = await page.evaluate(async (rowId) => {
          const control = document
            .getElementById(rowId)
            .parentElement.querySelector(".demo-control");
          control.style.inlineSize = "100px";
          const frame = () =>
            new Promise((r) => requestAnimationFrame(() => r()));
          await frame();
          await frame();
          const r = document
            .querySelector(`#${rowId} .acct-panel`)
            .getBoundingClientRect();
          control.style.removeProperty("inline-size");
          return {
            left: Math.round(r.left * 10) / 10,
            right: Math.round(r.right * 10) / 10,
            inner: window.innerWidth,
          };
        }, id);
        check(
          placed.left >= 0 && placed.right <= placed.inner,
          `[${width} ${scheme}] #${id}: a control in the row grows while open, the panel is still inside the viewport (left ${placed.left}, right ${placed.right}, width ${placed.inner})`,
        );
        await page.keyboard.press("Escape");
      }
      await page.close();
    }
  }

  // One control, three states, one box: nothing shifts when the session
  // answer arrives, and "Sign in" is a full touch target.
  for (const scheme of ["light", "dark"]) {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      colorScheme: scheme,
    });
    await page.goto(base);
    const signedIn = page.locator("#control-signed-in .acct-trigger");
    await signedIn.waitFor();
    const loading = page.locator("#control-loading > *");
    const signInLink = page.locator("#control-signed-out a.acct-signin");
    const a = await loading.boundingBox();
    const b = await signedIn.boundingBox();
    const outer = await page
      .locator("#control-signed-in > .acct")
      .boundingBox();
    check(
      a &&
        b &&
        outer &&
        a.width === b.width &&
        a.height === b.height &&
        a.width === outer.width &&
        a.height === outer.height,
      `[${scheme}] the loading box is the signed-in trigger's box (${a?.width}×${a?.height} vs ${b?.width}×${b?.height})`,
    );
    const link = await signInLink.boundingBox();
    check(
      link && link.height >= 44 && b && link.height === b.height,
      `[${scheme}] "Sign in" is at least 44px tall, the trigger's height (${link?.height})`,
    );
    const focusable = await page.evaluate(
      () =>
        document.querySelectorAll(
          "#control-loading a, #control-loading button, #control-loading [tabindex]",
        ).length,
    );
    check(
      focusable === 0,
      `[${scheme}] nothing in the loading box takes focus`,
    );
    await page.close();
  }

  // shown: "narrow". OrangeCat's header carries a theme toggle from 768px
  // up and its menu repeated it as "Appearance": the same control twice at
  // one width. A narrow row is in the menu below 768px only, hidden by the
  // stylesheet (no flash), skipped by the arrows, and a hidden group takes
  // its divider with it.
  for (const [width, wide] of [
    [390, false],
    [767, false],
    [768, true],
    [1280, true],
  ]) {
    for (const scheme of ["light", "dark"]) {
      const page = await browser.newPage({
        viewport: { width, height: 844 },
        colorScheme: scheme,
      });
      await page.goto(base);
      const trigger = page.locator("#narrow .acct-trigger");
      await trigger.waitFor();
      await trigger.focus();
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(50);
      const order = [];
      for (let i = 0; i < 6; i++) {
        order.push(
          await page.evaluate(() =>
            document.activeElement?.textContent?.trim(),
          ),
        );
        await page.keyboard.press("ArrowDown");
      }
      const expected = wide
        ? [
            "Settings",
            "Projects",
            "Sign out",
            "Settings",
            "Projects",
            "Sign out",
          ]
        : [
            "Appearance: Auto",
            "Settings",
            "Search",
            "Projects",
            "Sign out",
            "Appearance: Auto",
          ];
      check(
        JSON.stringify(order) === JSON.stringify(expected),
        `[${width} ${scheme}] narrow rows ${wide ? "skipped" : "reached"} by the arrows (${order.join(" > ")})`,
      );
      const seen = await page.evaluate(() => {
        const panel = document.querySelector("#narrow .acct-panel");
        const shown = (el) => el.getClientRects().length > 0;
        const groups = [...panel.querySelectorAll(":scope > .acct-group")]
          .filter(shown)
          .map((g) => getComputedStyle(g).borderTopWidth);
        return {
          appearance: [...panel.querySelectorAll(".acct-row")].some(
            (el) => shown(el) && el.textContent.includes("Appearance"),
          ),
          search: [...panel.querySelectorAll(".acct-row")].some(
            (el) => shown(el) && el.textContent.includes("Search"),
          ),
          extra: shown(panel.querySelector(".acct-extra")),
          groups,
          sideways:
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
        };
      });
      check(
        seen.appearance === !wide &&
          seen.search === !wide &&
          seen.extra === !wide,
        `[${width} ${scheme}] Appearance, Search and extra ${wide ? "hidden" : "shown"} (${seen.appearance}, ${seen.search}, ${seen.extra})`,
      );
      // One line under the identity block (its own edge), then one between
      // each pair of groups still shown: never two lines in a row.
      check(
        seen.groups[0] === "0px" &&
          seen.groups.slice(1).every((w) => w === "1px"),
        `[${width} ${scheme}] one divider between shown groups (${seen.groups.join(", ")})`,
      );
      check(!seen.sideways, `[${width} ${scheme}] nothing scrolls sideways`);
      await page.close();
    }
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

  // Other accounts: listed under who is signed in, reachable by keyboard,
  // switching says so, and a failed switch keeps the menu open.
  {
    const sw = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await sw.goto(base);
    const trigger = sw.locator("#switching .acct-trigger");
    await trigger.waitFor();
    await trigger.click();
    const panel = sw.locator("#switching .acct-panel");
    const accounts = sw.locator("#switching .acct-account");
    check((await accounts.count()) === 3, "the other accounts are listed");
    check(
      (await sw.locator("#switching .acct-heading").innerText()) ===
        "Switch account",
      "under a heading that says what a tap does",
    );
    const firstLine = await accounts
      .nth(0)
      .locator(".acct-account-line")
      .innerText();
    check(
      firstLine === "Main account · @cato",
      `the note leads the second line ("${firstLine}")`,
    );
    check(
      !(await panel.innerText()).includes("x@y.z"),
      "another account's email is never shown",
    );
    const dot = sw.locator("#switching .acct-trigger-dot");
    const dotBox = await dot.boundingBox();
    const trigBox = await trigger.boundingBox();
    check(
      dotBox &&
        trigBox &&
        dotBox.width >= 8 &&
        dotBox.x + dotBox.width <= trigBox.x + trigBox.width + 1 &&
        dotBox.y >= trigBox.y - 1,
      "a dot on the trigger says something waits in another account, unclipped",
    );
    const counts = await sw.locator("#switching .acct-waiting").allInnerTexts();
    check(
      counts.join(",") === "3,99+",
      `each account shows its count, capped (${counts.join(",")})`,
    );
    const countBoxes = await sw
      .locator("#switching .acct-waiting")
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
    const panelRight =
      (await panel.boundingBox()).x + (await panel.boundingBox()).width;
    check(
      countBoxes.every((r) => r <= panelRight),
      "a count stays inside the panel beside a long name",
    );
    check(
      (await accounts.nth(2).locator(".acct-glyph").count()) === 1 &&
        (await accounts.nth(2).locator(".acct-account-line").count()) === 0,
      "no name and no photo: a glyph, and the handle is not said twice",
    );
    const heights = await accounts.evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect().height),
    );
    check(
      heights.every((h) => h >= 44),
      `account rows are at least 44px (${heights.join(", ")})`,
    );
    const overflow = await sw.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    const box = await panel.boundingBox();
    check(
      overflow <= 0 && box && box.x >= 0 && box.x + box.width <= 390,
      `a long name and handle keep the panel on a 390px screen (${overflow}px)`,
    );
    for (const width of [320]) {
      await sw.setViewportSize({ width, height: 700 });
      const o = await sw.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      const b = await panel.boundingBox();
      check(
        o <= 0 && b && b.x >= 0 && b.x + b.width <= width,
        `and on a ${width}px screen (${o}px)`,
      );
    }
    await sw.setViewportSize({ width: 390, height: 844 });

    await sw.keyboard.press("Escape");
    await trigger.focus();
    await sw.keyboard.press("ArrowDown");
    await sw.waitForTimeout(50);
    const focused = await sw.evaluate(() =>
      document.activeElement?.classList.contains("acct-account"),
    );
    check(focused, "ArrowDown lands on the first account: arrows reach them");

    await accounts.nth(1).click();
    const alert = sw.locator("#switching .acct-accounts .acct-error");
    await alert.waitFor();
    check(
      (await alert.innerText()).includes("did not complete"),
      "a switch that fails says so",
    );
    check(await panel.isVisible(), "and the menu stays open to try again");

    await accounts.nth(0).click();
    await sw.waitForFunction(() => document.body.dataset.switchedTo === "main");
    check(true, "a tap calls the app's switch with that account");
    check(!(await panel.isVisible()), "and the menu closes when it completes");
    await sw.close();
  }

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
  // A product's own code as a way in (AOZ), and a claim, in every shipped language.
  for (const locale of AUTH_LABEL_LOCALES) {
    for (const width of [320, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const words = authLabelsFor(locale);
      const door = { ...authLabelsFor("en").code, ...words.code };
      await page.goto(`${base}?door=${locale}`);
      const screen = page.locator("#auth-door");
      await screen.getByRole("button", { name: "Mit Code anmelden" }).click();
      const field = screen.getByLabel("Zugangscode", { exact: true });
      await field.fill("aoz-abc2fa");
      check(
        (await field.inputValue()) === "AOZ-ABC2FA",
        `[door ${locale} ${width}] a code is typed in capitals`,
      );
      await screen
        .getByRole("button", { name: words.signIn, exact: true })
        .click();
      await screen.getByText(door.needsAnotherMethod).waitFor();
      const sent = await page.evaluate(() =>
        JSON.parse(document.body.dataset.door),
      );
      check(
        sent.path === "/sign-in/domain" && sent.credential === "AOZ-ABC2FA",
        `[door ${locale} ${width}] the code goes to /sign-in/domain as typed`,
      );
      check(
        (await screen.getByRole("button", { name: door.useEmail }).count()) ===
          1,
        `[door ${locale} ${width}] the way back to email is on the same screen`,
      );
      check(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `[door ${locale} ${width}] no sideways scroll`,
      );
      await page.screenshot({
        path: `/tmp/accountkit-door-${locale}-${width}.png`,
        fullPage: true,
      });
      // A personal link signs in once, and the code leaves the address bar.
      await page.goto(`${base}?door=${locale}&personal=res-link01`);
      await page.waitForURL((url) => url.hash === "#signed-in");
      const linked = await page.evaluate(() => ({
        sent: JSON.parse(document.body.dataset.door ?? "{}"),
        calls: Number(document.body.dataset.doorCalls ?? 0),
        search: location.search,
      }));
      check(
        linked.sent.credential === "RES-LINK01" &&
          linked.calls === 1 &&
          !linked.search.includes("personal"),
        `[door ${locale} ${width}] a personal link signs in once and leaves the address bar`,
      );

      const claim = { ...authLabelsFor("en").claim, ...words.claim };
      await page.goto(`${base}?claim=${locale}`);
      const form = page.locator("#auth-claim");
      await form.getByLabel("Zugangscode", { exact: true }).fill("aoz-claim1");
      await form
        .getByLabel(words.email, { exact: true })
        .fill("taken@example.ch");
      await form.locator("#acct-password").fill("a synthetic password");
      await form.getByRole("button", { name: claim.submit }).click();
      await form.getByText(claim.emailTaken).waitFor();
      const asked = await page.evaluate(() =>
        JSON.parse(document.body.dataset.claim),
      );
      check(
        asked.path === "/provision/claim" &&
          asked.credential === "code:AOZ-CLAIM1" &&
          asked.email === "taken@example.ch",
        `[claim ${locale} ${width}] the claim sends the product's credential, the address and the password`,
      );
      await form
        .getByLabel(words.email, { exact: true })
        .fill("new@example.ch");
      await form.getByRole("button", { name: claim.submit }).click();
      await form
        .getByText(claim.verifyEmail.replace("{email}", "new@example.ch"))
        .waitFor();
      check(
        true,
        `[claim ${locale} ${width}] a claim that waits for the address says so`,
      );
      check(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `[claim ${locale} ${width}] no sideways scroll`,
      );
      await page.screenshot({
        path: `/tmp/accountkit-claim-${locale}-${width}.png`,
        fullPage: true,
      });
      check(
        errors.length === 0,
        `[door/claim ${locale} ${width}] no runtime errors (${errors.join(" | ")})`,
      );
      await page.close();
    }
  }
  for (const [locale, width] of [
    ["en", 320],
    ["en", 390],
    ["de", 320],
    ["de", 390],
  ]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}?code=${locale}`);
    const screen = page.locator("#auth-code");
    const words = authLabelsFor(locale);
    await screen
      .getByLabel(words.email, { exact: true })
      .fill("ada@example.ch");
    await screen.getByRole("button", { name: words.withLink }).click();
    const field = screen.getByLabel(words.codePrompt, { exact: true });
    await field.waitFor();
    check(
      (await field.getAttribute("autocomplete")) === "one-time-code" &&
        (await field.getAttribute("inputmode")) === "numeric",
      `[code ${locale} ${width}] the code field asks the phone for the code from the email`,
    );
    await field.fill("123 456");
    const submit = screen.getByRole("button", { name: words.signInWithCode });
    const box = await submit.boundingBox();
    check(
      box && box.height >= 44,
      `[code ${locale} ${width}] the code button is at least 44px`,
    );
    await submit.click();
    await screen.getByText(words.errors.INVALID_CODE).waitFor();
    const sent = await page.evaluate(() =>
      JSON.parse(document.body.dataset.signInCode),
    );
    check(
      sent.email === "ada@example.ch" && sent.otp === "123456",
      `[code ${locale} ${width}] the code is sent without its space, for the address asked`,
    );
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `[code ${locale} ${width}] no sideways scroll`,
    );
    await page.screenshot({
      path: `/tmp/accountkit-code-${locale}-${width}.png`,
      fullPage: true,
    });
    check(errors.length === 0, `[code ${locale} ${width}] no runtime errors`);
    await page.close();
  }
  for (const [locale, width] of [
    ["en", 320],
    ["en", 390],
    ["de", 320],
    ["de", 390],
  ]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}?lightning=${locale}`);
    const screen = page.locator("#auth-lightning");
    const words = authLabelsFor(locale).lightning;
    await screen.getByRole("button", { name: words.withLightning }).click();
    const qr = screen.getByRole("img", { name: words.qr });
    await qr.waitFor();
    const qrBox = await qr.boundingBox();
    check(
      qrBox && qrBox.width >= 200,
      `[lightning ${locale} ${width}] the QR code is large enough to scan (${Math.round(qrBox?.width ?? 0)}px)`,
    );
    const open = screen.getByRole("link", { name: words.open });
    check(
      (await open.getAttribute("href")).startsWith("lightning:LNURL1"),
      `[lightning ${locale} ${width}] the wallet link is lightning:LNURL…`,
    );
    const box = await open.boundingBox();
    check(
      box && box.height >= 44,
      `[lightning ${locale} ${width}] the wallet link is at least 44px`,
    );
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `[lightning ${locale} ${width}] no sideways scroll`,
    );
    await page.screenshot({
      path: `/tmp/accountkit-lightning-${locale}-${width}.png`,
      fullPage: true,
    });
    await page.waitForURL(/#signed-in$/, { timeout: 8000 });
    check(
      true,
      `[lightning ${locale} ${width}] signed in once the wallet answered`,
    );
    check(
      errors.length === 0,
      `[lightning ${locale} ${width}] no runtime errors`,
    );
    await page.close();
  }
  for (const locale of AUTH_LABEL_LOCALES) {
    for (const width of [320, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.goto(`${base}?words=${locale}`);
      await page.locator("#auth-words button").first().waitFor();
      const cut = await page.evaluate(() => {
        const found = [];
        for (const button of document.querySelectorAll("#auth-words button")) {
          const text = button.textContent ?? "";
          for (const match of text.matchAll(/\S*\p{L}-\p{L}\S*/gu)) {
            const walker = document.createTreeWalker(
              button,
              NodeFilter.SHOW_TEXT,
            );
            let offset = 0;
            const range = document.createRange();
            let started = false;
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              const length = node.textContent.length;
              const start = match.index - offset;
              const end = match.index + match[0].length - offset;
              if (!started && start >= 0 && start < length) {
                range.setStart(node, start);
                started = true;
              }
              if (started && end <= length) {
                range.setEnd(node, end);
                break;
              }
              offset += length;
            }
            const tops = new Set(
              [...range.getClientRects()]
                .filter((r) => r.width > 0)
                .map((r) => Math.round(r.top)),
            );
            if (tops.size > 1) found.push(`${match[0]} in "${text}"`);
          }
        }
        return found;
      });
      check(
        cut.length === 0,
        `[${locale} ${width}] no hyphenated word is cut across lines${cut.length ? `: ${cut.join("; ")}` : ""}`,
      );
      // The label still reads as one sentence: every word starts on the same
      // line as the word before it, to its right, or on a later line. A flex
      // button lays each text node and span out as its own item, side by side,
      // so evig's "Stattdessen einen / Anmeldelink per | E-Mail | schicken"
      // read in three columns while no word was cut.
      const outOfOrder = await page.evaluate(() => {
        const found = [];
        for (const button of document.querySelectorAll("#auth-words button")) {
          const words = [];
          const walker = document.createTreeWalker(
            button,
            NodeFilter.SHOW_TEXT,
          );
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            for (const match of node.textContent.matchAll(/\S+/g)) {
              const range = document.createRange();
              range.setStart(node, match.index);
              range.setEnd(node, match.index + match[0].length);
              const rects = [...range.getClientRects()].filter(
                (r) => r.width > 0,
              );
              if (rects.length)
                words.push({
                  word: match[0],
                  first: rects[0],
                  last: rects.at(-1),
                });
            }
          }
          for (let i = 1; i < words.length; i++) {
            const prev = words[i - 1].last;
            const next = words[i].first;
            const sameLine = Math.abs(next.top - prev.top) < 2;
            const inOrder = sameLine
              ? next.left >= prev.right - 1
              : next.top >= prev.bottom - 2;
            if (!inOrder) {
              found.push(
                `"${words[i].word}" after "${words[i - 1].word}" in "${button.textContent}"`,
              );
              break;
            }
          }
        }
        return found;
      });
      check(
        outOfOrder.length === 0,
        `[${locale} ${width}] every button label reads as one sentence${outOfOrder.length ? `: ${outOfOrder.join("; ")}` : ""}`,
      );
      await page.close();
    }
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
