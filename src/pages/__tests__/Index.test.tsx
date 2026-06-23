import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import Index from "@/pages/Index";
import { renderWithProviders, setupGlobalMocks } from "@/pages/__tests__/test-utils";

// ── Hoisted mocks (available before vi.mock hoisting) ──
const mockSupabaseClient = vi.hoisted(() => ({
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  })),
  auth: {
    // Return null session so Index renders the logged-out (hero) view
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
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

vi.mock("@/components/AppShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock("lucide-react", () => ({
  ArrowRight: () => <svg data-testid="icon-arrow-right" />,
  BarChart3: () => <svg data-testid="icon-bar-chart" />,
  Brain: () => <svg data-testid="icon-brain" />,
  Globe: () => <svg data-testid="icon-globe" />,
}));

vi.mock("@/components/trading/SymbolList", () => ({
  default: () => <div data-testid="symbol-list" />,
}));

vi.mock("@/components/trading/ChartPanel", () => ({
  default: () => <div data-testid="chart-panel" />,
}));

vi.mock("@/components/trading/AccountAIPanel", () => ({
  default: () => <div data-testid="account-ai-panel" />,
}));

vi.mock("@/components/trading/OpenPositionsPanel", () => ({
  default: () => <div data-testid="open-positions-panel" />,
}));

vi.mock("@/components/AnaSahne", () => ({
  AnaSahne: () => <div data-testid="ana-sahne" />,
}));

vi.mock("@/hooks/useAnaSahne", () => ({
  useAnaSahne: vi.fn(() => ({})),
}));

vi.mock("@/lib/feature-flags", () => ({
  hasFeature: vi.fn(() => false),
}));

describe("Index", () => {
  beforeEach(() => {
    setupGlobalMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await cleanup();
  });

  it("renders hero title for logged-out users", async () => {
    renderWithProviders(<Index />);
    await waitFor(() => {
      // "Akıllı İşlem Paneli" is split across <span> elements, so use heading role
      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading).toBeInTheDocument();
      expect(heading.textContent).toContain("Akıllı");
      expect(heading.textContent).toContain("Paneli");
    });
  });
});