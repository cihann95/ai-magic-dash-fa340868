import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// ─── Helper: a component that throws on render ───
const Bomb: React.FC<{ shouldThrow?: boolean; message?: string }> = ({
  shouldThrow = false,
  message = "Test error",
}) => {
  if (shouldThrow) {
    throw new Error(message);
  }
  return <div>Safe content</div>;
};

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {}); // suppress React error logging
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });

  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <div>Hello world</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("catches an error and shows the default fallback UI", () => {
    // Suppress the uncaught error console output from React
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText("An unexpected error occurred. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it("renders custom fallback prop when provided", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom Error UI</div>}>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId("custom-fallback")).toBeInTheDocument();
    expect(screen.getByText("Custom Error UI")).toBeInTheDocument();
    // Default UI should NOT appear
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it("calls onError callback when an error is caught", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <Bomb shouldThrow message="boom" />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.any(Object));
    expect(onError.mock.calls[0][0].message).toBe("boom");

    consoleSpy.mockRestore();
  });

  it("renders fallbackRender function with the error", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary
        fallbackRender={(error) => <div data-testid="fn-fallback">Render fn: {error.message}</div>}
      >
        <Bomb shouldThrow message="fallback-render-test" />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId("fn-fallback")).toBeInTheDocument();
    expect(screen.getByText("Render fn: fallback-render-test")).toBeInTheDocument();
    // Default UI should NOT appear
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();

    consoleSpy.mockRestore();
  });
});
