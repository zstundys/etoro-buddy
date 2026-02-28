import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

const BASE_URL = process.env.SCREENSHOT_URL ?? "http://localhost:5173";
const OUT = join(dirname(Bun.main), "..", "screenshots");
const VIEWPORT = { width: 1440, height: 900 };

/**
 * Wraps every dollar amount in a `<span style="filter:blur(…)">` so the
 * actual values are unreadable in screenshots. SVG text/tspan elements get
 * the filter applied directly.
 */
async function blurDollarAmounts(page: Page) {
  await page.evaluate(() => {
    const BLUR = "6px";

    // Matches dollar amounts ($1,234.56) and percentage values (12.34%)
    const re = /[+-]?\s*\$[\d,]+(?:\.\d{0,2})?|[+-]?\d+(?:\.\d+)?%/g;
    const test = /\$\d|\d%/;

    // Collect all text nodes first (walking while mutating is unsafe)
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

    for (const node of textNodes) {
      const text = node.textContent;
      if (!text || !test.test(text)) continue;

      const frag = document.createDocumentFragment();
      let lastIdx = 0;
      let match: RegExpExecArray | null;

      re.lastIndex = 0;
      while ((match = re.exec(text)) !== null) {
        if (match.index > lastIdx) {
          frag.appendChild(
            document.createTextNode(text.slice(lastIdx, match.index)),
          );
        }

        const wrapper = document.createElement("span");
        wrapper.style.filter = `blur(${BLUR})`;
        wrapper.appendChild(document.createTextNode(match[0]));

        frag.appendChild(wrapper);
        lastIdx = match.index + match[0].length;
      }

      if (lastIdx < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx)));
      }

      node.parentNode?.replaceChild(frag, node);
    }

    // SVG text elements
    document.querySelectorAll("svg text, svg tspan").forEach((el) => {
      if (el.textContent && test.test(el.textContent)) {
        (el as SVGElement).style.filter = `blur(${BLUR})`;
      }
    });

    // Summary-card values (plain numbers without $ or %) — Portfolio summary
    // and Recent Activity stat cards. Target the value <p> inside each card by
    // finding label + value pairs in the known card grids.
    document
      .querySelectorAll<HTMLElement>(
        ".grid > .rounded-xl.border.border-border > p.text-lg",
      )
      .forEach((p) => {
        if (!p.style.filter) p.style.filter = `blur(${BLUR})`;
      });
  });
}

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

  console.log("→ Blurring dollar amounts...");
  await blurDollarAmounts(page);

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

  // Positions table (scroll heading to top, viewport shot)
  const positionsH2 = page
    .locator("section")
    .filter({ has: page.locator("h2", { hasText: "Positions" }) })
    .locator("h2")
    .first();
  if (await positionsH2.isVisible()) {
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
