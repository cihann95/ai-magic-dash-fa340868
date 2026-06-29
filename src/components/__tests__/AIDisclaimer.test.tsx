import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import AIDisclaimer from "@/components/AIDisclaimer";
import { renderWithProviders, setupGlobalMocks, mockLocalStorage } from "@/pages/__tests__/test-utils";

vi.mock("lucide-react", () => ({
  Info: () => <svg data-testid="icon-info" />,
}));

describe("AIDisclaimer", () => {
  beforeEach(() => {
    setupGlobalMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await cleanup();
  });

  it("renders Turkish disclaimer when lang is tr", () => {
    renderWithProviders(<AIDisclaimer />, { lang: "tr" });
    expect(screen.getByText(/Bu analiz bilgilendirme amaçlıdır/)).toBeInTheDocument();
  });

  it("renders English disclaimer when lang is en", () => {
    mockLocalStorage.getItem.mockImplementation((key: string) => {
      if (key === "lang") return "en";
      if (key === "theme") return "dark";
      return null;
    });
    renderWithProviders(<AIDisclaimer />);
    expect(screen.getByText(/This analysis is for informational purposes/)).toBeInTheDocument();
  });

  it("renders info icon", () => {
    renderWithProviders(<AIDisclaimer />, { lang: "en" });
    expect(screen.getByTestId("icon-info")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = renderWithProviders(<AIDisclaimer className="custom-class" />, { lang: "en" });
    expect(container.querySelector(".custom-class")).toBeInTheDocument();
  });
});
