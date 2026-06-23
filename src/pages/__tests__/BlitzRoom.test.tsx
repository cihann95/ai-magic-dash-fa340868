import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import BlitzRoomPage from "@/pages/BlitzRoom";
import { renderWithProviders, setupGlobalMocks } from "@/pages/__tests__/test-utils";

// ── Hoisted mocks ──
const mockUseBlitzRoom = vi.hoisted(() => vi.fn());

const mockSupabaseClient = vi.hoisted(() => ({
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockReturnThis(),
  })),
  auth: {
    getSession: vi.fn().mockResolvedValue({
      data: { session: { user: { id: "test-user-id", email: "test@example.com" }, access_token: "mock-token" } },
      error: null,
    }),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  },
  channel: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  })),
  removeChannel: vi.fn(),
  functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
}));

vi.mock("@/hooks/useBlitzRoom", () => ({
  useBlitzRoom: mockUseBlitzRoom,
}));

// Mock useLivePrices
vi.mock("@/hooks/useLivePrices", () => ({
  useLivePrice: vi.fn(() => ({ symbol: "BTC/USD", price: 60000, change_pct_24h: 1.5, change_24h: 900, updated_at: new Date().toISOString() })),
  useLivePrices: vi.fn(() => ({ "BTC/USD": { symbol: "BTC/USD", price: 60000 } })),
  refreshPrices: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: mockSupabaseClient,
}));

vi.mock("@/components/AppShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock("@/components/TradingViewChart", () => ({
  default: () => <div data-testid="tradingview-chart" />,
}));

vi.mock("@/components/blitz", () => ({
  BlitzTimer: ({ secondsLeft, status }: { secondsLeft: number | null; status: string }) => (
    <div data-testid="blitz-timer">{status}: {secondsLeft ?? "N/A"}s</div>
  ),
  TradeActions: ({ isActive, myOpenOrder, amount, onOpenPosition, onClosePosition }: Record<string, unknown>) => (
    <div data-testid="trade-actions">
      {isActive && <button onClick={() => { const fn = onOpenPosition as (side: string) => void; fn("long"); }}>Open Long</button>}
      {myOpenOrder && <button onClick={() => { const fn = onClosePosition as () => void; fn(); }}>Close</button>}
      <span>Amount: {String(amount)}</span>
    </div>
  ),
  BlitzLeaderboard: ({ ranking }: { ranking: [string, number][] }) => (
    <div data-testid="blitz-leaderboard">
      {ranking.map(([uid, pnl]) => <div key={uid}>{uid}: {pnl}</div>)}
    </div>
  ),
}));

vi.mock("@/lib/blitzSfx", () => ({
  blitzSfx: { countdown: vi.fn(), win: vi.fn(), lose: vi.fn(), close: vi.fn(), open: vi.fn() },
  vibrate: vi.fn(),
}));

vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...filterProps(props)}>{children}</div>,
  },
}));

// Helper: filter out non-DOM props from framer-motion
function filterProps(props: Record<string, unknown>): Record<string, unknown> {
  const { initial: _i, animate: _a, transition: _t, ...rest } = props;
  return rest;
}

vi.mock("@/lib/symbols", () => ({
  findSymbol: vi.fn(() => ({ symbol: "BTC/USD", tv: "BINANCE:BTCUSDT", name: "Bitcoin" })),
  SYMBOLS: [{ symbol: "BTC/USD" }],
}));

describe("BlitzRoom", () => {
  beforeEach(() => {
    setupGlobalMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await cleanup();
  });

  it("shows loading spinner when room is null", () => {
    mockUseBlitzRoom.mockReturnValue({ room: null, participants: [], orders: [] });
    renderWithProviders(<BlitzRoomPage />, { initialEntries: ["/blitz/room-123"] });
    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    // Loader2 icon should be present (loading spinner)
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows waiting state with 'Rakip bekleniyor' text", () => {
    mockUseBlitzRoom.mockReturnValue({
      room: { id: "r1", status: "waiting", symbol: "BTC/USD", entry_fee: 10, pot: 0, fee_collected: 0, invite_code: "ABC123", ends_at: null, winner_id: null, created_at: new Date().toISOString() },
      participants: [],
      orders: [],
    });
    renderWithProviders(<BlitzRoomPage />, { initialEntries: ["/blitz/r1"] });
    expect(screen.getByText(/Rakip bekleniyor/)).toBeInTheDocument();
    expect(screen.getByText(/ABC123/)).toBeInTheDocument();
  });

  it("renders active room with timer and trade actions", () => {
    const futureEnd = new Date(Date.now() + 60000).toISOString();
    mockUseBlitzRoom.mockReturnValue({
      room: { id: "r1", status: "active", symbol: "BTC/USD", entry_fee: 10, pot: 80, fee_collected: 4, ends_at: futureEnd, winner_id: null, created_at: new Date().toISOString(), start_price: 60000 },
      participants: [{ id: "p1", user_id: "test-user-id", room_id: "r1" }],
      orders: [],
    });
    renderWithProviders(<BlitzRoomPage />, { initialEntries: ["/blitz/r1"] });
    expect(screen.getByTestId("blitz-timer")).toBeInTheDocument();
    expect(screen.getByTestId("trade-actions")).toBeInTheDocument();
    expect(screen.getByTestId("tradingview-chart")).toBeInTheDocument();
  });

  it("shows invite code in waiting state when present", () => {
    mockUseBlitzRoom.mockReturnValue({
      room: { id: "r1", status: "waiting", symbol: "BTC/USD", entry_fee: 5, pot: 0, fee_collected: 0, invite_code: "XYZ789", ends_at: null, winner_id: null, created_at: new Date().toISOString() },
      participants: [],
      orders: [],
    });
    renderWithProviders(<BlitzRoomPage />, { initialEntries: ["/blitz/r1"] });
    expect(screen.getByText("Davet kodu:")).toBeInTheDocument();
    expect(screen.getByText("XYZ789")).toBeInTheDocument();
  });
});
