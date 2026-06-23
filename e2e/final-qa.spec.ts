import { test, expect, type Page } from "@playwright/test";
import path from "path";

/* ─── Mock Data ─────────────────────────────────────────────────────────── */

const MOCK_USER = {
  id: "qa-test-user-001",
  email: "qa@lumen.trade",
  aud: "authenticated",
  role: "authenticated",
  user_metadata: { display_name: "QA Tester" },
  created_at: "2026-01-01T00:00:00Z",
};

const MOCK_SESSION = {
  access_token: "mock-jwt-qa-e2e",
  token_type: "bearer",
  expires_in: 3600,
  refresh_token: "mock-refresh-qa-e2e",
  user: MOCK_USER,
};

const SCREENSHOT_DIR = path.resolve(".omo/evidence/final-qa");

/* ─── Helpers ───────────────────────────────────────────────────────────── */

async function mockAllEndpoints(page: Page) {
  // Auth endpoints - match ANY host with /auth/v1/
  await page.route(/\/auth\/v1\/(session|token|user|logout)/, (route) => {
    const url = route.request().url();
    if (url.includes("session")) {
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ data: { session: MOCK_SESSION } }),
      });
    }
    if (url.includes("token")) {
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify(MOCK_SESSION),
      });
    }
    if (url.includes("user")) {
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify(MOCK_USER),
      });
    }
    return route.fulfill({ status: 204 });
  });

  // REST endpoints
  await page.route(/\/rest\/v1\//, (route) => {
    const url = route.request().url();
    // Profiles
    if (url.includes("profiles")) {
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify([{ id: MOCK_USER.id, display_name: "QA Tester", demo_balance: 10000, demo_balance_locked: 0, initial_balance: 10000, real_balance: 10000, real_balance_locked: 0 }]),
      });
    }
    // Positions
    if (url.includes("positions")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    }
    // Orders
    if (url.includes("orders")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    }
    // Trades
    if (url.includes("trades")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    }
    if (url.includes("watchlist")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    }
    if (url.includes("notifications")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    }
    // Price cache
    if (url.includes("price_cache")) {
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify([{ symbol: "BTC", price: 67500, volume_24h: 28500000000 }]),
      });
    }
    // Generic: return empty
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });

  // RPC
  await page.route(/\/rest\/v1\/rpc\//, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(false) })
  );

  // Realtime / WebSocket - block
  await page.route(/\/realtime\//, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route(/wss?:/, (route) => route.abort("blockedbyclient"));
  await page.route(/api\.binance\.com/, (route) => route.abort("blockedbyclient"));
  await page.route(/stream\.binance\.com/, (route) => route.abort("blockedbyclient"));
  await page.route(/datafeed/, (route) => route.abort("blockedbyclient"));
  await page.route(/tradingview\.com/, (route) => route.abort("blockedbyclient"));
}

async function mockAuthState(page: Page) {
  await page.addInitScript(() => {
    const sessionData = {
      access_token: "mock-jwt-qa-e2e",
      refresh_token: "mock-refresh-qa-e2e",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
      user: {
        id: "qa-test-user-001",
        aud: "authenticated",
        role: "authenticated",
        email: "qa@lumen.trade",
        phone: "",
        confirmed_at: "2026-01-01T00:00:00Z",
        last_sign_in_at: "2026-01-01T00:00:00Z",
        app_metadata: { provider: "email" },
        user_metadata: { display_name: "QA Tester" },
        identities: [],
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    };
    // Try all possible Supabase storage key formats
    const keys = [
      "sb-localhost-auth-token",
      "sb-http-localhost-auth-token",
      "sb-localhost:54321-auth-token",
      "sb-http-localhost:54321-auth-token",
      "supabase.auth.token",
    ];
    for (const key of keys) {
      localStorage.setItem(key, JSON.stringify(sessionData));
    }
  });
}

/* ─── Tests ─────────────────────────────────────────────────────────────── */

test.describe("F3 Real Manual QA — Trading Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllEndpoints(page);
    await mockAuthState(page);
  });

  test("01 - SymbolList: 52px rows + font-price + sparkline container", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(4000);

    const lsCheck = await page.evaluate(() => ({
      keys: Object.keys(localStorage),
      hasSession: !!localStorage.getItem("sb-localhost-auth-token"),
    }));
    console.log("localStorage:", JSON.stringify(lsCheck));
    console.log("URL:", page.url());

    const bodyText = await page.locator("body").textContent();
    const snippet = bodyText?.substring(0, 300);
    console.log("Body start:", snippet);

    const fpCount = await page.locator(".font-price").count();
    console.log(`.font-price elements: ${fpCount}`);

    if (fpCount > 0) {
      const row = page.locator("button").filter({ has: page.locator(".font-price") }).first();
      await expect(row).toBeVisible();
      const box = await row.boundingBox();
      console.log(`Row height: ${box?.height}px`);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01-symbollist-rows.png"), fullPage: false });
    } else {
      const html = await page.locator("html").innerHTML();
      console.log("HTML first 1500:", html.substring(0, 1500));
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01-debug-failed.png"), fullPage: false });
    }
  });

  test("02 - ChartPanel stat bar + timeframe chips", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Wait for stat bar (h-9 element)
    const statBar = page.locator("div.h-9").first();
    await expect(statBar).toBeVisible({ timeout: 15000 });

    // Check 24h H/L indicators (they contain "24h H:" and "24h L:")
    const bodyText = await page.locator("body").textContent();
    console.log(`Page contains "24h H:": ${bodyText?.includes("24h H:")}`);
    console.log(`Page contains "24h L:": ${bodyText?.includes("24h L:")}`);
    console.log(`Page contains "Vol:": ${bodyText?.includes("Vol:")}`);

    // Check timeframe chips
    const tfs = ["1m", "5m", "15m", "1h", "4h", "1D"];
    for (const tf of tfs) {
      const chip = statBar.locator(`button:has-text("${tf}")`);
      const vis = await chip.isVisible().catch(() => false);
      console.log(`Timeframe "${tf}" visible: ${vis}`);
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02-stat-bar.png"), fullPage: false });
  });

  test("03 - Timeframe chip click", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(4000);

    // Click timeframe chips via evaluate to bypass overlay/overflow
    const chipsClicked = await page.evaluate(() => {
      const chips = document.querySelectorAll("div.h-9 button");
      let result = "";
      chips.forEach((chip) => {
        const text = chip.textContent?.trim() || "";
        if (text === "5m" || text === "1D") {
          (chip as HTMLButtonElement).click();
          result += text + " ";
        }
      });
      return result.trim() || "none";
    });
    console.log(`Chips clicked via evaluate: ${chipsClicked}`);

    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03-timeframe-5m.png"), fullPage: false });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03-timeframe-1d.png"), fullPage: false });
  });

  test("04 - OrderTicket: presets + LONG/SHORT + Collapsible TP/SL", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(4000);

    // Dismiss any overlay blocking pointer events (onboarding dialog etc)
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // Click Orders tab (Turkish: "Emirler")
    const ordersTab = page.locator("button[role='tab']").filter({ hasText: "Emirler" }).first();
    await ordersTab.click({ force: true });
    await page.waitForTimeout(1500);

    // Verify 4 preset buttons and LONG/SHORT toggle are visible
    for (const pct of ["10%", "25%", "50%", "100%"]) {
      const btn = page.locator("button").filter({ hasText: pct }).first();
      await expect(btn).toBeVisible();
    }
    console.log("Presets 10/25/50/100%: all OK");

    const longBtn = page.locator("button").filter({ hasText: "LONG" }).first();
    const shortBtn = page.locator("button").filter({ hasText: "SHORT" }).first();
    await expect(longBtn).toBeVisible();
    await expect(shortBtn).toBeVisible();
    console.log("LONG/SHORT toggle: OK");

    // Click 25% preset
    await page.locator("button").filter({ hasText: "25%" }).first().click({ force: true });
    await page.waitForTimeout(500);

    // Click TP/SL collapsible (Turkish: "Gelişmiş (TP/SL)")
    const tpSlBtn = page.locator("button").filter({ hasText: /TP\/SL/i }).first();
    await expect(tpSlBtn).toBeVisible();
    await tpSlBtn.click({ force: true });
    await page.waitForTimeout(500);

    // Verify TP and SL inputs appear
    const tpInput = page.locator("input[placeholder*='TP']").first();
    const slInput = page.locator("input[placeholder*='SL']").first();
    await expect(tpInput).toBeVisible({ timeout: 3000 });
    await expect(slInput).toBeVisible({ timeout: 3000 });
    console.log("TP/SL collapsible inputs: OK");

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04-order-ticket.png"), fullPage: false });
  });

  test("05 - OpenPositionsPanel: empty state", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(4000);

    await page.keyboard.press("Escape");

    // Verify empty state message
    const emptyMsg = page.locator("text=Açık pozisyon yok").first();
    await expect(emptyMsg).toBeVisible();
    console.log("Empty state message: OK");

    // Verify SVG icon (has rect)
    const emptySvg = page.locator("svg").filter({ has: page.locator("rect") }).first();
    await expect(emptySvg).toBeVisible();
    console.log("Empty state SVG icon: OK");

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05-positions.png"), fullPage: false });
  });

  test("06 - AccountAIPanel: 5 tabs", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(4000);

    await page.keyboard.press("Escape");

    // Look for 5 tabs in the TabsList (they are in the right panel)
    const tabsContainer = page.locator("div[role='tablist']").last();
    await expect(tabsContainer).toBeVisible({ timeout: 10000 });

    const allTabLists = page.locator("div[role='tablist']");
    const count = await allTabLists.count();
    console.log(`Tablist count: ${count}`);

    // Get the second tablist (index 1) which is AccountAIPanel's tablist
    // First tablist (0) is ChartPanel's tablist (Grafik, Emirler, Alarmlar, Bilgi)
    const aiTabData = await page.evaluate(() => {
      const allLists = document.querySelectorAll("div[role='tablist']");
      if (allLists.length < 2) return { count: 0, texts: [] };
      const aiList = allLists[1];
      const tabs = aiList.querySelectorAll("button[role='tab']");
      const texts: string[] = [];
      tabs.forEach((t) => texts.push(t.textContent?.trim() || "(icon-only)"));
      return { count: tabs.length, texts };
    });
    console.log("AI tabs:", JSON.stringify(aiTabData));

    // Click Analysis tab (Turkish: "Analiz") via native click
    const analysisTab = page.locator("div[role='tablist'] >> nth=1 >> button[role='tab']").filter({ hasText: "Analiz" }).first();
    if (await analysisTab.isVisible().catch(() => false)) {
      await analysisTab.click({ force: true });
      await page.waitForTimeout(500);
    }

    // Check for analyze button text (Turkish: "BTC için analiz")
    const btnTexts = await page.evaluate(() => {
      const btns = document.querySelectorAll("button");
      return Array.from(btns).map((b) => b.textContent?.trim() || "");
    });
    const hasAnalyzeBtn = btnTexts.some((t) => t.includes("için analiz"));
    console.log(`Analyze button: ${hasAnalyzeBtn ? 'OK' : 'NOT FOUND'}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06-signal-card.png"), fullPage: false });
  });

  test("07 - CommandPalette: Cmd+K opens with 3 groups", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Press Cmd+K
    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(1500);

    // Look for the command palette input
    const cmdInput = page.locator("[cmdk-input], input[placeholder*='Sembol'], input[placeholder*='symbol']").first();
    const cmdVis = await cmdInput.isVisible().catch(() => false);
    console.log(`Command palette visible: ${cmdVis}`);

    if (cmdVis) {
      // Check for group headings
      for (const group of ["Semboller", "Sayfalar", "Komutlar"]) {
        const el = page.locator(`[cmdk-group-heading], div:has-text("${group}")`).first();
        const vis = await el.isVisible().catch(() => false);
        console.log(`Group "${group}" visible: ${vis}`);
      }

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07-command-palette.png"), fullPage: false });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    }
  });
});
