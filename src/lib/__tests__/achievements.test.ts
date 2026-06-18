import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { celebrateAchievements } from "@/lib/achievements";

const mockInFn = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        in: mockInFn,
      }),
    })),
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

describe("achievements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when codes array is empty", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    vi.mocked(supabase.from).mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ data: null }),
      }),
    }));

    await celebrateAchievements([], "en");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("does nothing when codes is null/undefined", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    vi.mocked(supabase.from).mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ data: null }),
      }),
    }));

    await celebrateAchievements(null as unknown as string[], "en");
    await celebrateAchievements(undefined as unknown as string[], "en");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("fetches achievements and calls toast for each", async () => {
    const achievements = [
      {
        code: "first_trade",
        icon: "rocket",
        name_tr: "İlk İşlem",
        name_en: "First Trade",
        description_tr: "İlk işlemini yaptın",
        description_en: "Made your first trade",
        xp_reward: 100,
      },
      {
        code: "winning_streak",
        icon: "flame",
        name_tr: "Kazanma Serisi",
        name_en: "Winning Streak",
        description_tr: "5 kazanç üst üste",
        description_en: "5 wins in a row",
        xp_reward: 250,
      },
    ];

    const mockIn = vi.fn().mockResolvedValue({ data: achievements, error: null });
    const { supabase } = await import("@/integrations/supabase/client");
    vi.mocked(supabase.from).mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        in: mockIn,
      }),
    }));

    await celebrateAchievements(["first_trade", "winning_streak"], "en");

    expect(supabase.from).toHaveBeenCalledWith("achievements");
    expect(mockIn).toHaveBeenCalled();
  });

  it("uses Turkish names when lang is 'tr'", async () => {
    const achievements = [
      {
        code: "first_trade",
        icon: "rocket",
        name_tr: "İlk İşlem",
        name_en: "First Trade",
        description_tr: "İlk işlemini yaptın",
        description_en: "Made your first trade",
        xp_reward: 100,
      },
    ];

    const mockIn = vi.fn().mockResolvedValue({ data: achievements, error: null });
    const { supabase } = await import("@/integrations/supabase/client");
    vi.mocked(supabase.from).mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        in: mockIn,
      }),
    }));

    const { toast } = await import("@/hooks/use-toast");
    await celebrateAchievements(["first_trade"], "tr");

    expect(toast).toHaveBeenCalled();
  });

  it("does nothing when fetch returns no data", async () => {
    const mockIn = vi.fn().mockResolvedValue({ data: null, error: null });
    const { supabase } = await import("@/integrations/supabase/client");
    vi.mocked(supabase.from).mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        in: mockIn,
      }),
    }));

    const { toast } = await import("@/hooks/use-toast");
    await celebrateAchievements(["unknown_code"], "en");
    expect(toast).not.toHaveBeenCalled();
  });

  it("uses default trophy icon for unknown icon codes", async () => {
    const achievements = [
      {
        code: "mystery",
        icon: "unknown_icon",
        name_tr: "Gizem",
        name_en: "Mystery",
        description_tr: "Bilinmeyen rozet",
        description_en: "Unknown badge",
        xp_reward: 50,
      },
    ];

    const mockIn = vi.fn().mockResolvedValue({ data: achievements, error: null });
    const { supabase } = await import("@/integrations/supabase/client");
    vi.mocked(supabase.from).mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        in: mockIn,
      }),
    }));

    const { toast } = await import("@/hooks/use-toast");
    await celebrateAchievements(["mystery"], "en");

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("🏆"),
      })
    );
  });
});