import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import Leaderboard from "@/pages/Leaderboard";
import { renderWithProviders, setupGlobalMocks } from "@/pages/__tests__/test-utils";

// ── Hoisted mocks ──
const mockSupabaseClient = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
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
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: mockSupabaseClient,
}));

vi.mock("@/components/AppShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock("@/components/ProtectedRoute", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("lucide-react", () => ({
  Trophy: () => <svg data-testid="icon-trophy" />,
  Medal: () => <svg data-testid="icon-medal" />,
  Award: () => <svg data-testid="icon-award" />,
  BadgeCheck: () => <svg data-testid="icon-badgecheck" />,
  TrendingDown: () => <svg data-testid="icon-trendingdown" />,
  Activity: () => <svg data-testid="icon-activity" />,
  AlertCircle: () => <svg data-testid="icon-alertcircle" />,
  RefreshCw: () => <svg data-testid="icon-refreshcw" />,
  UserCircle: () => <svg data-testid="icon-usercircle" />,
  Settings: () => <svg data-testid="icon-settings" />,
}));

describe("Leaderboard", () => {
  beforeEach(() => {
    setupGlobalMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});

    mockSupabaseClient.from.mockImplementation((_table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
      chain.upsert = vi.fn().mockResolvedValue({ data: null, error: null });
      chain.update = vi.fn().mockReturnValue(chain);
      return chain;
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await cleanup();
  });

  it("renders leaderboard heading", async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: [], error: null });
    renderWithProviders(<Leaderboard />);
    await waitFor(() => {
      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading).toHaveTextContent("Liderlik");
    });
  });

  it("shows empty state when no rows", async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: [], error: null });
    renderWithProviders(<Leaderboard />);
    await waitFor(() => {
      expect(screen.getByText("—")).toBeInTheDocument();
    });
  });

  it("shows leaderboard rows with data", async () => {
    const leaderboardData = [
      { user_id: "u1", username: "trader1", level: 5, total_pnl: 150.50, win_rate: 72 },
      { user_id: "u2", username: "trader2", level: 3, total_pnl: -25.30, win_rate: 45 },
    ];
    mockSupabaseClient.rpc.mockImplementation(async () => ({
      data: leaderboardData,
      error: null,
    }));
    renderWithProviders(<Leaderboard />);
    await waitFor(() => {
      expect(screen.getByText("@trader1")).toBeInTheDocument();
      expect(screen.getByText("@trader2")).toBeInTheDocument();
      expect(screen.getByText("Lv 5")).toBeInTheDocument();
      expect(screen.getByText("Lv 3")).toBeInTheDocument();
      expect(screen.getByText(/150\.50/)).toBeInTheDocument();
      expect(screen.getByText(/25\.30/)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("shows join form when user has no active public profile", async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: [], error: null });
    mockSupabaseClient.from.mockImplementation((_table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
      chain.upsert = vi.fn().mockResolvedValue({ data: null, error: null });
      return chain;
    });
    renderWithProviders(<Leaderboard />);
    await waitFor(() => {
      expect(screen.getByText("Oluştur")).toBeInTheDocument();
    });
  });
});
