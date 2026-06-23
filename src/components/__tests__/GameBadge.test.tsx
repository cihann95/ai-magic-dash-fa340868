import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import GameBadge from "@/components/GameBadge";
import { MemoryRouter } from "react-router-dom";

const mockUseApp = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AppContext", () => ({
  useApp: (...args: unknown[]) => mockUseApp(...args),
}));

const mockSupabaseClient = vi.hoisted(() => ({
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  })),
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  },
  channel: vi.fn(() => {
    const ch = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    return ch;
  }),
  removeChannel: vi.fn(),
  functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: mockSupabaseClient,
}));

vi.mock("lucide-react", () => ({
  Flame: () => <svg data-testid="icon-flame" />,
  Zap: () => <svg data-testid="icon-zap" />,
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div data-testid="popover">{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div data-testid="popover-content">{children}</div>,
}));

vi.mock("@/components/ui/progress", () => ({
  Progress: ({ value }: { value: number }) => <div data-testid="progress" data-value={value} />,
}));

function renderGameBadge(user: { id: string } | null = { id: "test-user-id" }) {
  mockUseApp.mockReturnValue({
    user,
    lang: "tr",
  });
  return render(
    <MemoryRouter>
      <GameBadge />
    </MemoryRouter>,
  );
}

describe("GameBadge", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockSupabaseClient.from.mockImplementation((_table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      return chain;
    });
    mockSupabaseClient.channel.mockClear();
    mockSupabaseClient.removeChannel.mockClear();
  });

  afterEach(async () => {
    await cleanup();
  });

  it("returns null when user is not logged in", () => {
    const { container } = renderGameBadge(null);
    expect(container.querySelector("[data-testid='icon-zap']")).not.toBeInTheDocument();
  });

  it("returns null when user stats are not loaded", async () => {
    renderGameBadge();
    await waitFor(() => {
      expect(mockSupabaseClient.channel).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("icon-zap")).not.toBeInTheDocument();
  });

  it("renders badge with level and streak when stats are loaded", async () => {
    mockSupabaseClient.from.mockImplementation((_table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.maybeSingle = vi.fn().mockResolvedValue({
        data: { level: 5, xp: 350, current_streak: 7, total_trades: 100, profitable_trades: 72, total_pnl: 250.50 },
        error: null,
      });
      return chain;
    });
    renderGameBadge();
    await waitFor(() => {
      expect(screen.getByText(/Lv 5/)).toBeInTheDocument();
    });
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("subscribes to realtime channel for user_stats", async () => {
    renderGameBadge();
    await waitFor(() => {
      expect(mockSupabaseClient.channel).toHaveBeenCalledWith("stats_user");
    });
  });
});
