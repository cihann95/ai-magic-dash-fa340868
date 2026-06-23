import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import Settings from "@/pages/Settings";
import { renderWithProviders, setupGlobalMocks } from "@/pages/__tests__/test-utils";

// ── Hoisted mocks (available before vi.mock hoisting) ──
const mockSupabaseClient = vi.hoisted(() => ({
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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

vi.mock("@/components/ProtectedRoute", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/AppShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock("lucide-react", () => ({
  Moon: () => <svg data-testid="icon-moon" />,
  Sun: () => <svg data-testid="icon-sun" />,
  RotateCcw: () => <svg data-testid="icon-rotateccw" />,
  Bell: () => <svg data-testid="icon-bell" />,
  Download: () => <svg data-testid="icon-download" />,
  Users: () => <svg data-testid="icon-users" />,
  Wallet: () => <svg data-testid="icon-wallet" />,
  Info: () => <svg data-testid="icon-info" />,
}));

vi.mock("@/lib/pushSubscribe", () => ({
  enablePushNotifications: vi.fn().mockResolvedValue({ ok: false, reason: "test" }),
  disablePushNotifications: vi.fn().mockResolvedValue(undefined),
}));

describe("Settings", () => {
  beforeEach(() => {
    setupGlobalMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.single = vi.fn().mockResolvedValue({
          data: { display_name: "Test User" },
          error: null,
        });
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        return chain;
      }
      if (table === "public_profiles") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        return chain;
      }
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.order = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
      return chain;
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await cleanup();
  });

  it("renders settings heading", async () => {
    renderWithProviders(<Settings />);
    await waitFor(() => {
      expect(screen.getByText("Ayarlar")).toBeInTheDocument();
    });
  });
});