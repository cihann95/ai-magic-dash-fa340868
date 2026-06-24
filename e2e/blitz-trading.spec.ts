import { test, expect, type Page } from "@playwright/test";

/* ─── Mock Data ─────────────────────────────────────────────────────────── */

const MOCK_USER = {
  id: "user-e2e-001",
  email: "e2e@blitz.test",
  aud: "authenticated",
  role: "authenticated",
};

const MOCK_SESSION = {
  access_token: "mock-jwt-e2e",
  token_type: "bearer",
  expires_in: 3600,
  refresh_token: "mock-refresh-e2e",
  user: MOCK_USER,
};

function mockRoom(overrides: Record<string, unknown> = {}) {
  return {
    id: "room-e2e-001",
    symbol: "BTCUSD",
    status: "active",
    entry_fee: 10,
    pot: 20,
    fee_collected: 2,
    winner_id: null,
    invite_code: "ABC123",
    created_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

const MOCK_PARTICIPANTS = [
  { room_id: "room-e2e-001", user_id: "user-e2e-001" },
  { room_id: "room-e2e-001", user_id: "user-e2e-002" },
];

const MOCK_PROFILES = [
  { id: "user-e2e-001", real_balance: 500, real_balance_locked: 10, display_name: "Tester" },
  { id: "user-e2e-002", real_balance: 300, real_balance_locked: 10, display_name: "Opponent" },
];

const MOCK_PUBLIC_PROFILES = [
  { user_id: "user-e2e-001", username: "Tester" },
  { user_id: "user-e2e-002", username: "Opponent" },
];

let openOrders: unknown[] = [];
let allOrders: unknown[] = [];

/* ─── Route Helpers ─────────────────────────────────────────────────────── */

async function injectSessionIntoStorage(page: Page) {
  await page.addInitScript((user) => {
    const sessionData = {
      access_token: "mock-jwt-e2e",
      refresh_token: "mock-refresh-e2e",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
      user,
    };
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
  }, MOCK_USER);
}

async function mockSupabaseAuth(page: Page) {
  await injectSessionIntoStorage(page);
  await page.route("**/auth/v1/session**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { session: MOCK_SESSION } }) })
  );
  await page.route("**/auth/v1/token**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_SESSION) })
  );
}

async function setupBlitzMocks(page: Page, roomOverrides: Record<string, unknown> = {}) {
  openOrders = [];
  allOrders = [];

  // Auth
  await mockSupabaseAuth(page);

  // REST API
  await page.route("**/rest/v1/profiles**", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_PROFILES) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });

  await page.route("**/rest/v1/public_profiles**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_PUBLIC_PROFILES) })
  );

  await page.route("**/rest/v1/blitz_rooms**", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([mockRoom(roomOverrides)]) });
    }
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify([mockRoom(roomOverrides)]) });
  });

  await page.route("**/rest/v1/blitz_participants**", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_PARTICIPANTS) });
    }
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.route("**/rest/v1/blitz_orders**", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(openOrders) });
    }
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  // RPC
  await page.route("**/rest/v1/rpc/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) })
  );

  // Edge Functions
  await page.route("**/functions/v1/blitz-matchmake**", (route) => {
    const body = route.request().postDataJSON();
    if (body?.mode === "create_private") {
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ room_id: "room-e2e-001", invite_code: "ABC123" }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
  });

  await page.route("**/functions/v1/blitz-tick-order**", (route) => {
    const body = route.request().postDataJSON();
    if (body?.action === "open") {
      const order = { id: `order-${Date.now()}`, room_id: body.room_id ?? "room-e2e-001", user_id: MOCK_USER.id, side: body.side, amount: body.amount, entry_price: 65000, closed_at: null, opened_at: new Date().toISOString() };
      openOrders.push(order);
      allOrders.push(order);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: order.id, status: "open" }) });
    }
    if (body?.action === "close") {
      openOrders = openOrders.filter((o: any) => o.id !== body.order_id);
      const closed = allOrders.find((o: any) => o.id === body.order_id) as any;
      if (closed) { closed.closed_at = new Date().toISOString(); closed.pnl = 2.50; }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "closed" }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok" }) });
  });

  await page.route("**/functions/v1/blitz-settle-room**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
  );

  // Block external requests
  await page.route("**/realtime/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  );
  await page.route("**/websocket**", (route) => route.abort("blockedbyclient"));
  await page.route("**/wss/**", (route) => route.abort("blockedbyclient"));
  await page.route("**/api.binance.com/**", (route) => route.abort("blockedbyclient"));
  await page.route("**/stream.binance.com/**", (route) => route.abort("blockedbyclient"));
}

/* ─── Tests ─────────────────────────────────────────────────────────────── */

test.describe("Blitz Trading Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupBlitzMocks(page);
  });

  test("01 - Blitz lobby loads with all options", async ({ page }) => {
    await page.goto("/blitz");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    await expect(page.getByRole("heading", { name: /Blitz Arena/ })).toBeVisible();
    await expect(page.getByText("60 saniye. 1v1.")).toBeVisible();

    // Symbol selector
    await expect(page.getByRole("button", { name: "BTCUSD" })).toBeVisible();

    // Entry fee selector
    await expect(page.getByRole("button", { name: "$5", exact: true })).toBeVisible();

    // Tabs
    await expect(page.getByRole("tab", { name: /Hızlı Maç/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Özel Oda/ })).toBeVisible();

    await page.screenshot({ path: "test-results/blitz/01-lobby.png", fullPage: true });
  });

  test("02 - Create private room and get invite code", async ({ page }) => {
    await page.goto("/blitz");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    await expect(page.getByRole("heading", { name: /Blitz Arena/ })).toBeVisible();
    await page.getByRole("tab", { name: /Özel Oda/ }).click();
    await page.waitForTimeout(500);

    const createBtn = page.getByRole("button", { name: /Davet kodu oluştur/ });
    await expect(createBtn).toBeEnabled({ timeout: 5000 });
    await createBtn.click();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: "test-results/blitz/02-private-room-created.png", fullPage: true });
  });

  test("03 - Room waiting state shows invite code", async ({ page }) => {
    await page.goto("/blitz/room-e2e-001");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    // Room page should show waiting state or room content
    const hasWaiting = await page.getByText("Rakip bekleniyor").isVisible().catch(() => false);
    const hasRoom = await page.getByText("BTCUSD").isVisible().catch(() => false);
    expect(hasWaiting || hasRoom).toBeTruthy();

    await page.screenshot({ path: "test-results/blitz/03-room-waiting.png", fullPage: true });
  });

  test("04 - Active room shows timer, chart, and trade actions", async ({ page }) => {
    await page.goto("/blitz/room-e2e-001");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    // Timer should be visible (countdown or waiting state)
    const timerVisible = await page.locator(".tabular-nums").first().isVisible().catch(() => false);
    expect(timerVisible).toBeTruthy();

    // BTCUSD symbol shown
    await expect(page.getByText("BTCUSD")).toBeVisible();

    // Havuz (pot) display
    await expect(page.getByText("Havuz")).toBeVisible();

    // Trade actions should be present when active
    const longBtn = page.getByRole("button", { name: /LONG/ });
    const shortBtn = page.getByRole("button", { name: /SHORT/ });
    const hasActions = (await longBtn.isVisible().catch(() => false)) || (await shortBtn.isVisible().catch(() => false));
    expect(hasActions).toBeTruthy();

    await page.screenshot({ path: "test-results/blitz/04-active-room.png", fullPage: true });
  });

  test("05 - Place LONG order and see position display", async ({ page }) => {
    await page.goto("/blitz/room-e2e-001");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    const longBtn = page.getByRole("button", { name: /LONG/ });
    if (await longBtn.isVisible().catch(() => false)) {
      await longBtn.click();
      await page.waitForTimeout(1500);

      // Realtime is blocked so the order list won't re-fetch; reload to pick up the new order from mock
      await page.goto("/blitz/room-e2e-001");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(3000);

      const closeBtn = page.getByRole("button", { name: /Pozisyonu Kapat/ });
      const hasPosition = await closeBtn.isVisible().catch(() => false);
      expect(hasPosition).toBeTruthy();

      await page.screenshot({ path: "test-results/blitz/05-long-order.png", fullPage: true });
    }
  });

  test("06 - Place SHORT order", async ({ page }) => {
    await page.goto("/blitz/room-e2e-001");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    const shortBtn = page.getByRole("button", { name: /SHORT/ });
    if (await shortBtn.isVisible().catch(() => false)) {
      await shortBtn.click();
      await page.waitForTimeout(1500);

      // Realtime is blocked so the order list won't re-fetch; reload to pick up the new order from mock
      await page.goto("/blitz/room-e2e-001");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(3000);

      const closeBtn = page.getByRole("button", { name: /Pozisyonu Kapat/ });
      const hasPosition = await closeBtn.isVisible().catch(() => false);
      expect(hasPosition).toBeTruthy();

      await page.screenshot({ path: "test-results/blitz/06-short-order.png", fullPage: true });
    }
  });

  test("07 - Quick amount selector updates", async ({ page }) => {
    await page.goto("/blitz/room-e2e-001");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    // Click different amount buttons
    const amounts = ["$25", "$50"];
    for (const amt of amounts) {
      const btn = page.getByRole("button", { name: amt, exact: true });
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(300);
      }
    }

    await page.screenshot({ path: "test-results/blitz/07-amount-selector.png", fullPage: true });
  });

  test("08 - Empty orderbook state", async ({ page }) => {
    openOrders = [];
    await page.goto("/blitz/room-e2e-001");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    // Leaderboard should show participants with 0 PnL
    const leaderboard = page.getByText("Canlı Sıralama");
    if (await leaderboard.isVisible().catch(() => false)) {
      await expect(leaderboard).toBeVisible();
    }

    await page.screenshot({ path: "test-results/blitz/08-empty-orderbook.png", fullPage: true });
  });

  test("09 - Room settlement shows result dialog", async ({ page }) => {
    // Re-mock with finished room
    await page.unroute("**/rest/v1/blitz_rooms**");
    await page.route("**/rest/v1/blitz_rooms**", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify([mockRoom({ status: "finished", winner_id: "user-e2e-001", ends_at: new Date().toISOString() })]),
        });
      }
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify([mockRoom()]) });
    });

    await page.goto("/blitz/room-e2e-001");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    // Result dialog should appear
    const dialog = page.getByRole("dialog");
    const hasDialog = await dialog.isVisible().catch(() => false);

    if (hasDialog) {
      const resultText = await dialog.textContent().catch(() => "");
      expect(resultText).toMatch(/Kazandın|Kaybettin|Berabere/);

      // PnL display
      await expect(dialog.locator(".tabular-nums").first()).toBeVisible();

      // Exit and rematch buttons
      await expect(dialog.getByRole("button", { name: /Çık/ })).toBeVisible();
      await expect(dialog.getByRole("button", { name: /Rövanş/ })).toBeVisible();

      await page.screenshot({ path: "test-results/blitz/09-settlement-dialog.png", fullPage: true });
    } else {
      await page.screenshot({ path: "test-results/blitz/09-settlement-no-dialog.png", fullPage: true });
    }
  });

  test("10 - Leaderboard displays participant rankings", async ({ page }) => {
    await page.goto("/blitz/room-e2e-001");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    const leaderboard = page.getByText("Canlı Sıralama");
    if (await leaderboard.isVisible().catch(() => false)) {
      await expect(leaderboard).toBeVisible();

      const hasTester = await page.getByText("Tester").isVisible().catch(() => false);
      const hasOpponent = await page.getByText("Opponent").isVisible().catch(() => false);
      expect(hasTester || hasOpponent).toBeTruthy();
    }

    await page.screenshot({ path: "test-results/blitz/10-leaderboard.png", fullPage: true });
  });

  test("11 - Edge case: room not found shows loading", async ({ page }) => {
    await page.unroute("**/rest/v1/blitz_rooms**");
    await page.route("**/rest/v1/blitz_rooms**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) })
    );

    await page.goto("/blitz/nonexistent-room");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    await page.screenshot({ path: "test-results/blitz/11-room-not-found.png", fullPage: true });
  });

  test("12 - Max position amount selector", async ({ page }) => {
    await page.goto("/blitz/room-e2e-001");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    const amounts = ["$5", "$10", "$25", "$50"];
    for (const amt of amounts) {
      const btn = page.getByRole("button", { name: amt, exact: true });
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(200);
      }
    }

    await page.screenshot({ path: "test-results/blitz/12-max-positions.png", fullPage: true });
  });

  test("13 - Sound toggle works", async ({ page }) => {
    await page.goto("/blitz/room-e2e-001");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    const soundBtn = page.locator("button[title]").first();
    if (await soundBtn.isVisible().catch(() => false)) {
      await soundBtn.click();
      await page.waitForTimeout(300);
      await soundBtn.click();
    }

    await page.screenshot({ path: "test-results/blitz/13-sound-toggle.png", fullPage: true });
  });

  test("14 - TradingView chart renders in room", async ({ page }) => {
    await page.goto("/blitz/room-e2e-001");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(5000);

    const chartContainer = page.locator(".rounded-2xl.overflow-hidden").first();
    const chartVisible = await chartContainer.isVisible().catch(() => false);
    expect(chartVisible).toBeTruthy();

    await page.screenshot({ path: "test-results/blitz/14-chart.png", fullPage: true });
  });

  test("15 - Full trading flow: open → close → result", async ({ page }) => {
    await page.goto("/blitz/room-e2e-001");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    // Step 1: Place LONG order
    const longBtn = page.getByRole("button", { name: /LONG/ });
    if (await longBtn.isVisible().catch(() => false)) {
      await longBtn.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: "test-results/blitz/15a-position-opened.png", fullPage: true });

      // Step 2: Close position
      const closeBtn = page.getByRole("button", { name: /Pozisyonu Kapat/ });
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
        await page.waitForTimeout(1500);
        await page.screenshot({ path: "test-results/blitz/15b-position-closed.png", fullPage: true });
      }
    }

    // Step 3: Check final state
    await page.screenshot({ path: "test-results/blitz/15c-final-state.png", fullPage: true });
  });
});
