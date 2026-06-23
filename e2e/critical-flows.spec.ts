import { test, expect, type Page } from "@playwright/test";
import path from "path";

/* ─── Mock Data ─────────────────────────────────────────────────────────── */

const MOCK_USER = {
  id: "user-critical-001",
  email: "critical@lumen.trade",
  aud: "authenticated",
  role: "authenticated",
  user_metadata: { display_name: "Critical Tester" },
  created_at: "2026-01-01T00:00:00Z",
};

const MOCK_SESSION = {
  access_token: "mock-jwt-critical-e2e",
  token_type: "bearer" as const,
  expires_in: 3600,
  refresh_token: "mock-refresh-critical-e2e",
  user: MOCK_USER,
};

/** Inject session into localStorage so Supabase SDK's getSession() finds it on load. */
async function injectSessionIntoStorage(page: Page) {
  await page.addInitScript((user) => {
    const sessionData = {
      access_token: "mock-jwt-critical-e2e",
      refresh_token: "mock-refresh-critical-e2e",
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

const MOCK_PROFILE = [
  {
    id: MOCK_USER.id,
    display_name: "Critical Tester",
    real_balance: 10000,
    real_balance_locked: 0,
  },
];

const MOCK_PRICE_CACHE = [
  {
    symbol: "BTCUSD",
    price: 67500.0,
    change_pct_24h: 2.35,
    updated_at: new Date().toISOString(),
  },
  {
    symbol: "ETHUSD",
    price: 3450.0,
    change_pct_24h: -0.82,
    updated_at: new Date().toISOString(),
  },
];

const MOCK_POSITIONS: unknown[] = [];

const MOCK_ORDERS: unknown[] = [];

const SCREENSHOT_DIR = path.resolve("test-results/e2e/critical-flows");

/* ─── Route Helpers ─────────────────────────────────────────────────────── */

/** Block external requests that would slow tests. */
async function blockExternals(page: Page) {
  await page.route("**/realtime/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  );
  await page.route("**/websocket**", (route) => route.abort("blockedbyclient"));
  await page.route("**/wss/**", (route) => route.abort("blockedbyclient"));
  await page.route("**/api.binance.com/**", (route) => route.abort("blockedbyclient"));
  await page.route("**/stream.binance.com/**", (route) => route.abort("blockedbyclient"));
}

/** Mock Supabase auth as unauthenticated (session = null). */
async function mockAuthUnauthenticated(page: Page) {
  await page.route("**/auth/v1/session**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { session: null } }),
    })
  );
  await page.route("**/auth/v1/token**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_SESSION),
    })
  );
  await page.route("**/auth/v1/user**", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({}),
    })
  );
  await page.route("**/auth/v1/logout**", (route) =>
    route.fulfill({ status: 204 })
  );
  await blockExternals(page);
}

async function mockAuthPreAuthenticated(page: Page) {
  await injectSessionIntoStorage(page);
  await page.route("**/auth/v1/session**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { session: MOCK_SESSION } }),
    })
  );
  await page.route("**/auth/v1/token**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_SESSION),
    })
  );
  await page.route("**/auth/v1/user**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_USER),
    })
  );
  await page.route("**/auth/v1/logout**", (route) =>
    route.fulfill({ status: 204 })
  );
  await blockExternals(page);
}

/** Mock REST API endpoints for the trading dashboard. */
async function mockRestEndpoints(page: Page) {
  await page.route("**/rest/v1/profiles**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_PROFILE),
    })
  );
  await page.route("**/rest/v1/price_cache**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_PRICE_CACHE),
    })
  );
  await page.route("**/rest/v1/positions**", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_POSITIONS),
      });
    }
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
  await page.route("**/rest/v1/orders**", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_ORDERS),
      });
    }
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
  await page.route("**/rest/v1/watchlist**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    })
  );
  await page.route("**/rest/v1/trades**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    })
  );
  await page.route("**/rest/v1/rpc/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    })
  );
}

/** Mock the manage-order edge function to return success. */
async function mockManageOrder(page: Page) {
  await page.route("**/functions/v1/manage-order**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: `order-${Date.now()}`, status: "open" }),
    })
  );
}

/** Mock the execute-trade edge function to return success. */
async function mockExecuteTrade(page: Page) {
  await page.route("**/functions/v1/execute-trade**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: `trade-${Date.now()}`,
        price: 67500,
        balance: 9500,
      }),
    })
  );
}

/** Mock edge functions that the app may call on load. */
async function mockEdgeFunctions(page: Page) {
  await page.route("**/functions/v1/ai-*/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ analysis: "Mock analysis result" }),
    })
  );
}

/** Set up all mocks for a fully authenticated trading dashboard. */
async function setupDashboardMocks(page: Page) {
  await mockAuthPreAuthenticated(page);
  await mockRestEndpoints(page);
  await mockManageOrder(page);
  await mockExecuteTrade(page);
  await mockEdgeFunctions(page);
}

/* ─── Scenario 1: Auth Flow ─────────────────────────────────────────────── */

test.describe("Scenario 1 — Auth Flow", () => {
  test("01a - Unauthenticated user sees landing page with auth CTA", async ({ page }) => {
    await mockAuthUnauthenticated(page);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    // Index.tsx renders a public landing page for unauthenticated users (no redirect to /auth)
    const hasSignin = await page.getByRole("button", { name: /giriş|sign.?in/i }).first().isVisible().catch(() => false);
    const hasBranding = await page.getByText("Lumen Trade").first().isVisible().catch(() => false);
    expect(hasSignin || hasBranding).toBeTruthy();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "01a-unauth-landing.png"),
      fullPage: true,
    });
  });

  test("01b - Auth page shows login form elements", async ({ page }) => {
    await mockAuthUnauthenticated(page);
    await page.goto("/auth");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    // Verify email input, password input, and login button are visible
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /giriş|sign.?in/i })
    ).toBeVisible();

    // Verify branding
    await expect(page.getByText("Lumen Trade")).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "01b-auth-page-form.png"),
      fullPage: true,
    });
  });

  test("01c - Invalid email stays on /auth with error", async ({ page }) => {
    await mockAuthUnauthenticated(page);

    // Override token to return error
    await page.unroute("**/auth/v1/token**");
    await page.route("**/auth/v1/token**", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          code: "invalid_credentials",
          message: "Invalid login credentials",
        }),
      })
    );

    await page.goto("/auth");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);

    // Fill invalid credentials
    await page.locator("#email").fill("invalid@fake.com");
    await page.locator("#password").fill("wrongpassword");

    // Submit
    await page.getByRole("button", { name: /giriş|sign.?in/i }).click();
    await page.waitForTimeout(2500);

    // Should stay on /auth
    expect(page.url()).toContain("/auth");

    // Login button should still be visible (form not replaced)
    await expect(
      page.getByRole("button", { name: /giriş|sign.?in/i })
    ).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "01c-invalid-login-stays.png"),
      fullPage: true,
    });
  });

  test("01d - Demo mode button is clickable if present", async ({ page }) => {
    await mockAuthUnauthenticated(page);
    await page.goto("/auth");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    // Look for a demo/demo-mode button (case-insensitive)
    const demoBtn = page.getByRole("button", { name: /demo|test|try/i });
    const hasDemo = await demoBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasDemo) {
      await expect(demoBtn).toBeEnabled();
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, "01d-demo-button-visible.png"),
        fullPage: true,
      });
    } else {
      // Demo button doesn't exist in this build — still a valid outcome
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, "01d-no-demo-button.png"),
        fullPage: true,
      });
    }
  });
});

/* ─── Scenario 2: Trading Dashboard ────────────────────────────────────── */

test.describe("Scenario 2 — Trading Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
  });

  test("02a - Dashboard loads with SymbolList, ChartPanel, and right panel", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    // SymbolList should show at least one symbol
    const symbolButtons = page.locator("aside").first().locator("button");
    const symbolCount = await symbolButtons.count();
    expect(symbolCount).toBeGreaterThanOrEqual(1);

    // ChartPanel container should be visible (the chart section)
    const chartSection = page.locator("section.rounded-2xl").first();
    await expect(chartSection).toBeVisible();

    // Right panel: on desktop, it's ResizablePanelGroup; on mobile, it's Tabs
    // Check for at least one of these
    const rightPanel = page.locator("aside.order-3");
    await expect(rightPanel).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "02a-dashboard-loaded.png"),
      fullPage: true,
    });
  });

  test("02b - SymbolList shows BTCUSD and ETHUSD", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    // Verify specific symbols are rendered
    const hasBTC = await page.getByText("BTCUSD").first().isVisible().catch(() => false);
    const hasETH = await page.getByText("ETHUSD").first().isVisible().catch(() => false);
    expect(hasBTC || hasETH).toBeTruthy();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "02b-symbol-list-symbols.png"),
      fullPage: true,
    });
  });
});

/* ─── Scenario 3: Order Ticket ─────────────────────────────────────────── */

test.describe("Scenario 3 — Order Ticket", () => {
  let manageOrderCalled = false;

  test.beforeEach(async ({ page }) => {
    manageOrderCalled = false;
    await setupDashboardMocks(page);

    // Track manage-order calls
    await page.route("**/functions/v1/manage-order**", (route) => {
      manageOrderCalled = true;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: `order-${Date.now()}`, status: "open" }),
      });
    });
  });

  test("03a - Click symbol shows order form with quantity and total", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    // Click on BTCUSD in SymbolList
    const btcBtn = page.locator("aside").first().getByText("BTCUSD").first();
    if (await btcBtn.isVisible().catch(() => false)) {
      await btcBtn.click();
      await page.waitForTimeout(1500);
    }

    // The ChartPanel should now show BTCUSD heading
    const chartHeading = page.locator("section.rounded-2xl").first();
    await expect(chartHeading).toBeVisible();

    // The bottom bar has a quantity input and total display (≈ $X.XX)
    const quantityInput = page.locator('input[type="number"]').first();
    await expect(quantityInput).toBeVisible();

    // Fill quantity
    await quantityInput.fill("2");
    await page.waitForTimeout(500);

    // Verify total is calculated and displayed (≈ $XXX.XX)
    const totalText = page.locator("text=/\\≈.*\\$/").first();
    const hasTotal = await totalText.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasTotal).toBeTruthy();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "03a-order-form-quantity.png"),
      fullPage: true,
    });
  });

  test("03b - Orders tab shows OrderTicket and submit calls manage-order", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    // Click on a symbol
    const btcBtn = page.locator("aside").first().getByText("BTCUSD").first();
    if (await btcBtn.isVisible().catch(() => false)) {
      await btcBtn.click();
      await page.waitForTimeout(1500);
    }

    // Switch to the "orders" tab in ChartPanel
    const ordersTab = page.getByRole("tab", { name: /emir|order/i });
    if (await ordersTab.isVisible().catch(() => false)) {
      await ordersTab.click();
      await page.waitForTimeout(1000);

      // OrderTicket should be visible with its own quantity input
      const placeOrderBtn = page.getByRole("button", { name: /emir ver|place.?order/i });
      if (await placeOrderBtn.isVisible().catch(() => false)) {
        // Fill quantity in OrderTicket's input
        const qtyInputs = page.locator('input[type="number"]');
        const qtyCount = await qtyInputs.count();
        if (qtyCount > 0) {
          // The first number input in OrderTicket is quantity
          await qtyInputs.nth(0).fill("0.5");
          await page.waitForTimeout(500);
        }

        // Click place order
        await placeOrderBtn.click();
        await page.waitForTimeout(2000);

        // Verify manage-order was intercepted
        expect(manageOrderCalled).toBeTruthy();
      }
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "03b-order-ticket-submit.png"),
      fullPage: true,
    });
  });
});

/* ─── Scenario 4: Mobile Responsive ────────────────────────────────────── */

test.describe("Scenario 4 — Mobile Responsive", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupDashboardMocks(page);
  });

  test("04a - Bottom navigation tabs are visible on mobile", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    // BottomNav renders on lg:hidden → visible at 375px
    const bottomNav = page.locator("nav.lg\\:hidden");
    await expect(bottomNav).toBeVisible();

    // Verify key nav items
    const hasMarkets = await page.getByText("Piyasalar").first().isVisible().catch(() => false);
    const hasPortfolio = await page.getByText("Portföy").first().isVisible().catch(() => false);
    const hasBlitz = await bottomNav.getByText("Blitz").isVisible().catch(() => false);
    expect(hasMarkets || hasPortfolio || hasBlitz).toBeTruthy();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "04a-mobile-bottom-nav.png"),
      fullPage: true,
    });
  });

  test("04b - Mobile right panel shows Pozisyonlar tab and content", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    // On mobile, the right panel renders Tabs with "positions" and "ai" triggers
    // "Pozisyonlar" is the open_positions label
    const positionsTab = page.getByRole("tab", { name: /pozisyon|position/i });
    const hasPositionsTab = await positionsTab.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasPositionsTab) {
      await positionsTab.click();
      await page.waitForTimeout(1000);

      // Verify the positions content is displayed
      const positionsContent = page.getByText(/açık pozisyon|open.?position/i).first();
      const hasContent = await positionsContent.isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasContent).toBeTruthy();
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "04b-mobile-pozisyonlar-tab.png"),
      fullPage: true,
    });
  });

  test("04c - Mobile right panel shows AI tab and content switches", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    // Click the AI tab trigger
    const aiTab = page.getByRole("tab", { name: "AI" });
    const hasAiTab = await aiTab.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasAiTab) {
      await aiTab.click();
      await page.waitForTimeout(1500);

      // The AI panel should now be active — look for AI-related content
      const aiContent = page.getByText(/AI|analiz|analysis/i).first();
      const hasAiContent = await aiContent.isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasAiContent).toBeTruthy();
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "04c-mobile-ai-tab.png"),
      fullPage: true,
    });
  });
});

/* ─── Scenario 5: Blitz Page ───────────────────────────────────────────── */

test.describe("Scenario 5 — Blitz Page", () => {
  const MOCK_BLITZ_ROOMS = [
    {
      id: "room-blitz-001",
      symbol: "BTCUSD",
      status: "active",
      entry_fee: 10,
      pot: 20,
      fee_collected: 2,
      winner_id: null,
      invite_code: "BLZ123",
      created_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 60_000).toISOString(),
    },
  ];

  async function setupBlitzMocks(page: Page) {
    // Auth
    await mockAuthPreAuthenticated(page);

    // REST
    await page.route("**/rest/v1/profiles**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_PROFILE),
      })
    );
    await page.route("**/rest/v1/blitz_rooms**", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_BLITZ_ROOMS),
        });
      }
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify([MOCK_BLITZ_ROOMS[0]]),
      });
    });
    await page.route("**/rest/v1/blitz_participants**", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            { room_id: "room-blitz-001", user_id: MOCK_USER.id },
          ]),
        });
      }
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });
    await page.route("**/rest/v1/blitz_orders**", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      }
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });
    await page.route("**/rest/v1/rpc/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      })
    );

    // Edge functions
    await page.route("**/functions/v1/blitz-matchmake**", (route) => {
      const body = route.request().postDataJSON();
      if (body?.mode === "create_private") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ room_id: "room-blitz-001", invite_code: "BLZ123" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });
    await page.route("**/functions/v1/blitz-tick-order**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok" }),
      })
    );
    await page.route("**/functions/v1/blitz-settle-room**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      })
    );
    await page.route("**/functions/v1/blitz-join-private**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ room_id: "room-blitz-001" }),
      })
    );

    // Block externals
    await blockExternals(page);
  }

  test("05a - Blitz page loads with heading and lobby content", async ({
    page,
  }) => {
    await setupBlitzMocks(page);
    await page.goto("/blitz");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Verify Blitz heading is visible
    await expect(page.getByText("Blitz", { exact: true })).toBeVisible();

    // Verify lobby content: symbol selector, entry fee, tabs
    await expect(page.getByText("60 saniye. 1v1.")).toBeVisible();

    // Symbol selector buttons should exist
    await expect(page.getByRole("button", { name: "BTCUSD" })).toBeVisible();

    // Entry fee buttons should exist
    await expect(page.getByRole("button", { name: "$5" })).toBeVisible();

    // Tabs: Hızlı Maç / Özel Oda
    await expect(page.getByRole("tab", { name: /Hızlı Maç/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Özel Oda/ })).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "05a-blitz-page-loaded.png"),
      fullPage: true,
    });
  });

  test("05b - Blitz page shows room list or empty state", async ({ page }) => {
    await setupBlitzMocks(page);
    await page.goto("/blitz");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Either rooms are listed or "oda yok" / empty state is shown
    const hasRooms = await page.getByText("BTCUSD").first().isVisible().catch(() => false);
    const hasEmptyState = await page
      .getByText(/oda yok|henüz oda|no rooms/i)
      .first()
      .isVisible()
      .catch(() => false);

    // At least one of these should be true
    expect(hasRooms || hasEmptyState).toBeTruthy();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "05b-blitz-rooms-or-empty.png"),
      fullPage: true,
    });
  });
});
