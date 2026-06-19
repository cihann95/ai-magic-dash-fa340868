import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NotFound from "@/pages/NotFound";

describe("NotFound", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("renders 404 heading", () => {
    render(
      <MemoryRouter initialEntries={["/nonexistent-route"]}>
        <NotFound />
      </MemoryRouter>,
    );
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("renders page not found message", () => {
    render(
      <MemoryRouter initialEntries={["/some-page"]}>
        <NotFound />
      </MemoryRouter>,
    );
    expect(screen.getByText("Oops! Page not found")).toBeInTheDocument();
  });

  it("renders return to home link", () => {
    render(
      <MemoryRouter initialEntries={["/unknown"]}>
        <NotFound />
      </MemoryRouter>,
    );
    const homeLink = screen.getByText("Return to Home");
    expect(homeLink).toBeInTheDocument();
    expect(homeLink.closest("a")).toHaveAttribute("href", "/");
  });

  it("logs 404 error with the attempted path", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <MemoryRouter initialEntries={["/bad-path"]}>
        <NotFound />
      </MemoryRouter>,
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "404 Error: User attempted to access non-existent route:",
      "/bad-path",
    );
    consoleSpy.mockRestore();
  });
});
