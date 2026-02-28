import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

const BASE_URL = process.env.SCREENSHOT_URL ?? "http://localhost:5173";
const OUT = join(dirname(Bun.main), "..", "screenshots");
const VIEWPORT = { width: 1440, height: 900 };

async function screenshotChart(
  page: Page,
  chartsSection: ReturnType<Page["locator"]>,
  title: string,
  filename: string,
) {
  const card = chartsSection
    .locator("div.rounded-xl")
    .filter({ has: page.locator("h3", { hasText: title }) })
    .first();

  if (await card.isVisible()) {
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await card.screenshot({ path: join(OUT, filename) });
    console.log(`  ✓ ${filename}`);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  console.log(`→ Target: ${BASE_URL}`);

  const browser = await chromium.launch({ args: ["--no-sandbox"] });

  // --- Screenshot 1: API key setup (fresh state, no data) ---
  {
    const ctx = await browser.newContext({
      viewport: VIEWPORT,
      colorScheme: "dark",
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    const setupForm = page.locator("text=Connect your eToro account");
    if (await setupForm.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await page.screenshot({ path: join(OUT, "api-setup.png") });
      console.log("  ✓ api-setup.png");
    } else {
      console.log("  ⊘ api-setup.png (skipped — server has keys)");
    }
    await ctx.close();
  }

  // --- Screenshots 2+: loaded dashboard (needs API keys) ---
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: "dark",
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  await page.goto(BASE_URL, { waitUntil: "load" });

  // If the server didn't pre-render data, try injecting API keys from env
  const hasData = await page
    .locator("text=Portfolio Value")
    .isVisible({ timeout: 3_000 })
    .catch(() => false);

  if (!hasData) {
    const apiKey = process.env.ETORO_API_KEY;
    const userKey = process.env.ETORO_USER_KEY;
    if (apiKey && userKey) {
      console.log("→ Injecting API keys from environment...");
      await page.evaluate(
        ({ ak, uk }) => {
          localStorage.setItem(
            "etoro-api-keys",
            JSON.stringify({ apiKey: ak, userKey: uk }),
          );
        },
        { ak: apiKey, uk: userKey },
      );
      await page.reload({ waitUntil: "load" });
    }
  }

  console.log("→ Waiting for portfolio data...");
  try {
    await page.waitForSelector("text=Portfolio Value", { timeout: 60_000 });
  } catch {
    console.error(
      "✗ Timed out waiting for data. Ensure the dev server is running and API keys are configured:",
    );
    console.error("    Option A: Set ETORO_API_KEY and ETORO_USER_KEY in .env");
    console.error(
      "    Option B: export ETORO_API_KEY=... ETORO_USER_KEY=... before running",
    );
    await browser.close();
    process.exit(1);
  }

  console.log("→ Waiting for charts to render...");
  try {
    await page
      .locator("text=Loading price history")
      .waitFor({ state: "hidden", timeout: 90_000 });
  } catch {
    // may never appear if candles load quickly
  }
  await page.waitForTimeout(5_000);

  console.log("→ Enabling privacy mode...");
  const privacyBtn = page.locator('button[aria-label="Hide values"]');
  if (await privacyBtn.isVisible()) {
    await privacyBtn.click();
    await page.waitForTimeout(500);
  }

  // --- Take screenshots ---
  console.log("→ Taking screenshots...");

  // Dashboard hero (viewport from top)
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, "dashboard.png") });
  console.log("  ✓ dashboard.png");

  // Full page
  await page.screenshot({ path: join(OUT, "full-page.png"), fullPage: true });
  console.log("  ✓ full-page.png");

  // Portfolio summary cards
  const summaryCards = page.locator(".mb-8.grid.grid-cols-1").first();
  if (await summaryCards.isVisible()) {
    await summaryCards.screenshot({
      path: join(OUT, "portfolio-summary.png"),
    });
    console.log("  ✓ portfolio-summary.png");
  }

  // Positions table (expand first group + first month, scroll heading to top)
  const positionsSection = page
    .locator("section")
    .filter({ has: page.locator("h2", { hasText: "Positions" }) });
  const positionsH2 = positionsSection.locator("h2").first();
  if (await positionsH2.isVisible()) {
    await page.evaluate(() => {
      const section = document.querySelector("section:has(h2)")!;
      const headings = section?.querySelectorAll("h2");
      let posSection: Element | null = null;
      headings?.forEach((h) => {
        if (h.textContent?.trim() === "Positions") posSection = h.closest("section");
      });
      if (!posSection) return;

      // Click first group row (top-level expand button)
      const firstGroupBtn = (posSection as Element).querySelector(
        ".rounded-xl.border > button",
      ) as HTMLElement | null;
      firstGroupBtn?.click();
    });
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      const section = document.querySelector("section:has(h2)")!;
      const headings = section?.querySelectorAll("h2");
      let posSection: Element | null = null;
      headings?.forEach((h) => {
        if (h.textContent?.trim() === "Positions") posSection = h.closest("section");
      });
      if (!posSection) return;

      // Click first month row inside the expanded group
      const borderTDiv = (posSection as Element).querySelector(
        ".border-t.border-border",
      );
      const monthBtn = borderTDiv?.querySelector("button") as HTMLElement | null;
      monthBtn?.click();
    });
    await page.waitForTimeout(300);

    await positionsH2.evaluate((el) =>
      el.scrollIntoView({ block: "start" }),
    );
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, "positions-table.png") });
    console.log("  ✓ positions-table.png");
  }

  // Buying Opportunities table (scroll heading to top, viewport shot)
  const buyingOpportunitiesH2 = page
    .locator("h2", { hasText: "Buying Opportunities" })
    .first();
  if (await buyingOpportunitiesH2.isVisible()) {
    await buyingOpportunitiesH2.evaluate((el) =>
      el.scrollIntoView({ block: "start" }),
    );
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, "buying-opportunities.png") });
    console.log("  ✓ buying-opportunities.png");
  }

  // Individual charts — one per ChartCard in ChartsDashboard
  const chartsSection = page.locator("section.mt-10").first();
  if (await chartsSection.isVisible()) {
    const charts: [string, string][] = [
      ["Portfolio Value Over Time", "chart-portfolio-value.png"],
      ["Portfolio Allocation", "chart-allocation.png"],
      ["Timing vs Performance", "chart-bubble-scatter.png"],
      ["Capital Over Time", "chart-streamgraph.png"],
      ["Sunburst", "chart-sunburst.png"],
      ["P&L Distribution", "chart-beeswarm.png"],
      ["Performance Race", "chart-performance-race.png"],
      ["Trade Activity", "chart-calendar.png"],
      ["Price Horizon", "chart-horizon.png"],
      ["Volume Ribbons", "chart-volume-ribbons.png"],
      ["Position Lifespans", "chart-timeline.png"],
      ["Fees & Dividends", "chart-fees-waterfall.png"],
      ["Monthly Capital Flow", "chart-chord.png"],
    ];
    for (const [title, filename] of charts) {
      await screenshotChart(page, chartsSection, title, filename);
    }
  }

  // Recent Activity section
  const recentActivity = page
    .locator("section")
    .filter({ has: page.locator("h2", { hasText: "Recent Activity" }) })
    .first();
  if (await recentActivity.isVisible()) {
    await recentActivity.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, "recent-activity.png") });
    console.log("  ✓ recent-activity.png");
  }

  console.log(`\n✓ Done — screenshots saved to screenshots/`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
