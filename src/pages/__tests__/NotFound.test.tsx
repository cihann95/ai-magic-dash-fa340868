import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import NotFound from "@/pages/NotFound";
import { renderWithProviders } from "@/pages/__tests__/test-utils";

describe("NotFound", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("renders 404 heading", () => {
    renderWithProviders(<NotFound />, { initialEntries: ["/nonexistent-route"] });
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("renders page not found message", () => {
    renderWithProviders(<NotFound />, { initialEntries: ["/some-page"] });
    expect(screen.getByText("Oops! Page not found")).toBeInTheDocument();
  });

  it("renders return to home link", () => {
    renderWithProviders(<NotFound />, { initialEntries: ["/unknown"] });
    const homeLink = screen.getByText("Return to Home");
    expect(homeLink).toBeInTheDocument();
    expect(homeLink.closest("a")).toHaveAttribute("href", "/");
  });

  it("logs 404 error with the attempted path", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderWithProviders(<NotFound />, { initialEntries: ["/bad-path"] });
    expect(consoleSpy).toHaveBeenCalledWith(
      "404 Error: User attempted to access non-existent route:",
      "/bad-path",
    );
    consoleSpy.mockRestore();
  });
});
