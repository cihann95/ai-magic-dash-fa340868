import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import Blitz from "@/pages/Blitz";
import { renderWithProviders, setupGlobalMocks } from "@/pages/__tests__/test-utils";

// ── Hoisted mocks (available before vi.mock hoisting) ──
const mockSupabaseClient = vi.hoisted(() => ({
  from: vi.fn(),
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
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: mockSupabaseClient,
}));

vi.mock("@/components/AppShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock("lucide-react", () => ({
  Loader2: () => <svg data-testid="icon-loader2" />,
  Swords: () => <svg data-testid="icon-swords" />,
  Plus: () => <svg data-testid="icon-plus" />,
  KeyRound: () => <svg data-testid="icon-keyround" />,
  Zap: () => <svg data-testid="icon-zap" />,
  X: () => <svg data-testid="icon-x" />,
}));

describe("Blitz", () => {
  beforeEach(() => {
    setupGlobalMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.maybeSingle = vi.fn().mockResolvedValue({
          data: { real_balance: 1000, real_balance_locked: 0 },
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

  it("renders Blitz Arena heading", async () => {
    renderWithProviders(<Blitz />);
    await waitFor(() => {
      // "Blitz Arena" is split across <span>Blitz</span> Arena, so use heading role
      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading).toBeInTheDocument();
      expect(heading.textContent).toContain("Blitz");
      expect(heading.textContent).toContain("Arena");
    });
  });
});