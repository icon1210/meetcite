import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

// Every page and meeting tab must fit the screen at every common width: nothing may stick out past the
// edge and make the page scroll sideways. Small phones (320px) up to large monitors (1920px).
const WIDTHS = [320, 360, 390, 414, 600, 768, 820, 1024, 1280, 1440, 1920];
const SCREENSHOT_WIDTHS = new Set([320, 390, 768, 1920]);
const MEETING_TABS = [
  "Summary",
  "Action items",
  "Decisions",
  "Questions & risks",
  "Evidence review",
  "Follow-up",
  "Series memory",
  "Transcript",
  "Compare",
  "Insights",
  "Ask",
];

/** Elements that reach past the viewport edge without sitting inside a box that scrolls or clips them. */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) return true;
      }
      return false;
    };
    const offenders = new Set<string>();
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue; // screen-reader-only and empty elements
      if ((r.right > vw + 1 || r.left < -1) && !clipped(el)) {
        const cls = typeof el.className === "string" ? el.className.split(/\s+/).slice(0, 4).join(".") : "";
        const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
        offenders.add(
          `${el.tagName.toLowerCase()}${cls ? "." + cls : ""} [${Math.round(r.left)}..${Math.round(r.right)}] "${text}"`,
        );
      }
    }
    return { sideScroll: document.documentElement.scrollWidth - vw, offenders: [...offenders].slice(0, 6) };
  });
}

test("every page fits every screen width", async ({ browser }) => {
  test.setTimeout(600_000);
  const problems: Record<string, unknown> = {};
  const shots = "test-results/screens/responsive";
  mkdirSync(shots, { recursive: true });

  const check = async (page: Page, name: string, width: number) => {
    await page.waitForTimeout(250);
    const result = await overflow(page);
    if (result.sideScroll > 1 || result.offenders.length) problems[`${name} @ ${width}px`] = result;
    if (SCREENSHOT_WIDTHS.has(width)) {
      await page.screenshot({ path: `${shots}/${name.replace(/[^a-z0-9]+/gi, "-")}-${width}.png`, fullPage: true });
    }
  };

  // Visitor pages.
  const visitor = await browser.newPage({ reducedMotion: "reduce" });
  for (const width of WIDTHS) {
    await visitor.setViewportSize({ width, height: 800 });
    for (const [name, path] of [
      ["landing", "/"],
      ["login", "/login"],
      ["register", "/register"],
    ] as const) {
      await visitor.goto(path);
      await visitor.waitForLoadState("networkidle");
      await check(visitor, name, width);
    }
  }
  await visitor.close();

  // A signed-in user with a series and a processed demo meeting.
  const page = await browser.newPage({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
  await page.goto("/register");
  await page.getByLabel("Name").fill("Screen Tester");
  await page.getByLabel("Email").fill(`screens-${Date.now()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("a-long-password");
  await page.getByLabel("Confirm password").fill("a-long-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("button", { name: "New series" }).click();
  await page.getByLabel("New series name").fill("Weekly team meeting with a fairly long series name");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("link", { name: "Add a meeting" })).toBeVisible();
  const seriesUrl = page.url();
  await page.getByRole("link", { name: "Add a meeting" }).click();
  await page.locator('input[type="file"][accept^=".mp3"]').setInputFiles({
    name: "quarterly-planning-and-budget-review-with-the-whole-team.mp3",
    mimeType: "audio/mpeg",
    buffer: Buffer.from("ID3 sample"),
  });
  await page.getByLabel("Agenda (optional)").fill("Launch date\nBudget\nHiring plan");
  await page.getByRole("button", { name: "Upload and process" }).click();
  await expect(page.getByRole("tab", { name: /Summary/ })).toBeVisible({ timeout: 30_000 });
  const meetingUrl = page.url();
  await page.getByRole("tab", { name: /Compare/ }).click();
  await page.getByRole("button", { name: /Generate C1/ }).click();
  await expect(page.getByRole("button", { name: "Use this version" })).toBeVisible({ timeout: 30_000 });

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    for (const [name, path] of [
      ["dashboard", "/"],
      ["upload", "/upload"],
      ["record", "/record"],
      ["series", seriesUrl],
    ] as const) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await check(page, name, width);
    }
    await page.goto(meetingUrl);
    await expect(page.getByRole("tab", { name: /Summary/ })).toBeVisible();
    for (const tab of MEETING_TABS) {
      await page.getByRole("tab", { name: new RegExp(`^${tab.replace("&", "&")}`) }).click();
      await check(page, `meeting-${tab}`, width);
    }
  }

  writeFileSync("test-results/responsive-report.json", JSON.stringify(problems, null, 2));
  expect(problems, "Pages that don't fit the screen (details in test-results/responsive-report.json)").toEqual({});
});
