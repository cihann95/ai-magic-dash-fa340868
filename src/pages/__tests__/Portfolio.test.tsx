import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import Portfolio from "@/pages/Portfolio";
import { renderWithProviders, setupGlobalMocks } from "@/pages/__tests__/test-utils";

// ── Hoisted mocks (available before vi.mock hoisting) ──
const mockSupabaseClient = vi.hoisted(() => ({
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  })),
  auth: {
    getSession: vi.fn().mockResolvedValue({
      data: {
        session: {
          user: { id: "test-user-id", email: "test@example.com", user_metadata: { display_name: "Test User" } },
          access_token: "mock-token",
        },
      },
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

vi.mock("@/integrations/supabase/client", () => ({
  supabase: mockSupabaseClient,
}));

// ── Mock ProtectedRoute — just pass through ──
vi.mock("@/components/ProtectedRoute", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── Mock AppShell — minimal shell ──
vi.mock("@/components/AppShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

// ── Mock lucide-react icons as simple functional components ──
vi.mock("lucide-react", () => ({
  Heart: (_props: Record<string, unknown>) => <svg data-testid="icon-heart" />,
  EyeOff: (_props: Record<string, unknown>) => <svg data-testid="icon-eyeoff" />,
  Eye: (_props: Record<string, unknown>) => <svg data-testid="icon-eye" />,
}));

// ── Mock recharts ──
vi.mock("recharts", () => ({
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => <div data-testid="pie" />,
  Cell: () => <div data-testid="cell" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  Tooltip: () => <div data-testid="tooltip" />,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div data-testid="area" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
}));

// ── Mock useLivePrices ──
vi.mock("@/hooks/useLivePrices", () => ({
  useLivePrices: vi.fn(() => ({})),
}));

describe("Portfolio", () => {
  beforeEach(() => {
    setupGlobalMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === "positions") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockResolvedValue({ data: [], error: null });
        return chain;
      }
      if (table === "trades") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.order = vi.fn().mockResolvedValue({ data: [], error: null });
        return chain;
      }
      if (table === "profiles") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.maybeSingle = vi.fn().mockResolvedValue({
          data: { demo_balance: 100000, initial_balance: 100000, preferred_view: "pnl" },
          error: null,
        });
        return chain;
      }
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      return chain;
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await cleanup();
  });

  it("renders portfolio title", async () => {
    renderWithProviders(<Portfolio />);
    await waitFor(() => {
      expect(screen.getByText("Portföy")).toBeInTheDocument();
    });
  });

  it("shows balance card with equity value", async () => {
    renderWithProviders(<Portfolio />);
    await waitFor(() => {
      expect(screen.getByText("$100,000.00")).toBeInTheDocument();
    });
    expect(screen.getByText("Demo Bakiye")).toBeInTheDocument();
  });

  it("shows open positions count", async () => {
    renderWithProviders(<Portfolio />);
    await waitFor(() => {
      expect(screen.getByText("0")).toBeInTheDocument();
    });
    expect(screen.getByText("Açık Pozisyonlar")).toBeInTheDocument();
  });
});
