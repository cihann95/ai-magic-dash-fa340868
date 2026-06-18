/* eslint-disable react-refresh/only-export-components */
import { ReactNode } from "react";
import { render, RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AppProvider } from "@/contexts/AppContext";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

// Mock user for testing
export const mockUser = {
  id: "test-user-id",
  email: "test@example.com",
  user_metadata: { display_name: "Test User" },
};

// Mock session
export const mockSession = {
  user: mockUser,
  access_token: "mock-token",
  refresh_token: "mock-refresh",
  expires_at: Date.now() + 3600000,
  token_type: "bearer",
};

// Create a test query client
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

// Wrapper component for tests
interface WrapperProps {
  children: ReactNode;
  user?: typeof mockUser | null;
  session?: typeof mockSession | null;
  lang?: "tr" | "en";
  theme?: "dark" | "light";
  initialEntries?: string[];
}

export function TestWrapper({
  children,
  _user = mockUser,
  _session = mockSession,
  _lang = "tr",
  theme = "dark",
  initialEntries = ["/"],
}: WrapperProps) {
  const queryClient = createTestQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme={theme} enableSystem={false}>
        <MemoryRouter initialEntries={initialEntries}>
          <AppProvider>
            {children}
            <Toaster />
          </AppProvider>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

// Custom render function with providers
export function renderWithProviders(
  ui: ReactNode,
  options: Omit<RenderOptions, "wrapper"> & Partial<WrapperProps> = {}
) {
  const { user, session, lang, theme, initialEntries, ...renderOptions } = options;

  return render(ui, {
    wrapper: ({ children }) => (
      <TestWrapper
        user={user}
        session={session}
        lang={lang}
        theme={theme}
        initialEntries={initialEntries}
      >
        {children}
      </TestWrapper>
    ),
    ...renderOptions,
  });
}

// Mock Supabase
export const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    delete: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockReturnThis(),
  })),
  functions: {
    invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
  channel: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  })),
  removeChannel: vi.fn(),
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: mockSession }, error: null }),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  },
};

// Mock localStorage
export const mockLocalStorage = {
  getItem: vi.fn((key: string) => {
    if (key === "lang") return "tr";
    if (key === "theme") return "dark";
    return null;
  }),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};

// Mock navigator.serviceWorker
export const mockServiceWorker = {
  getRegistration: vi.fn().mockResolvedValue({
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(null),
    },
  }),
};

// Mock window.matchMedia
export const mockMatchMedia = vi.fn((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

// Mock window.addEventListener for beforeinstallprompt
export const mockBeforeInstallPrompt = vi.fn();

// Setup global mocks
export function setupGlobalMocks() {
  vi.stubGlobal("localStorage", mockLocalStorage);
  vi.stubGlobal("matchMedia", mockMatchMedia);
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: mockMatchMedia,
  });
  Object.defineProperty(navigator, "serviceWorker", {
    writable: true,
    value: mockServiceWorker,
  });
  window.addEventListener = mockBeforeInstallPrompt;
  window.removeEventListener = vi.fn();
}

// Cleanup global mocks
export function cleanupGlobalMocks() {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
}