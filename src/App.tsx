import { lazy, Suspense } from "react";
import * as Sentry from "@sentry/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider } from "@/contexts/AppContext";
import { ErrorFallback } from "@/components/ErrorFallback";
import ProtectedRoute from "./components/ProtectedRoute";
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";

const ResetPassword = lazy(() => import("./pages/ResetPassword.tsx"));
const Portfolio = lazy(() => import("./pages/Portfolio.tsx"));
const History = lazy(() => import("./pages/History.tsx"));
const Watchlist = lazy(() => import("./pages/Watchlist.tsx"));
const Settings = lazy(() => import("./pages/Settings.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const Leaderboard = lazy(() => import("./pages/Leaderboard.tsx"));
const Achievements = lazy(() => import("./pages/Achievements.tsx"));
const Heatmap = lazy(() => import("./pages/Heatmap.tsx"));
const Social = lazy(() => import("./pages/Social.tsx"));
const Coach = lazy(() => import("./pages/Coach.tsx"));
const Journal = lazy(() => import("./pages/Journal.tsx"));
const Insights = lazy(() => import("./pages/Insights.tsx"));
const Blitz = lazy(() => import("./pages/Blitz.tsx"));
const BlitzRoom = lazy(() => import("./pages/BlitzRoom.tsx"));
const AdminBlitz = lazy(() => import("./pages/AdminBlitz.tsx"));
const AdminRooms = lazy(() => import("./pages/AdminRooms.tsx"));
const AdminSettings = lazy(() => import("./pages/AdminSettings.tsx"));
const AdminUsers = lazy(() => import("./pages/AdminUsers.tsx"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Sentry.ErrorBoundary fallback={({ error, resetError }) => <ErrorFallback error={error} resetError={resetError} />}>
          <AppProvider>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="/history" element={<History />} />
                <Route path="/watchlist" element={<Watchlist />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                <Route path="/achievements" element={<Achievements />} />
                <Route path="/heatmap" element={<Heatmap />} />
                <Route path="/social" element={<Social />} />
                <Route path="/coach" element={<Coach />} />
                <Route path="/journal" element={<Journal />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="/blitz" element={<Blitz />} />
                <Route path="/blitz/:roomId" element={<BlitzRoom />} />
                <Route path="/admin/blitz" element={<ProtectedRoute requiredRole="admin"><AdminBlitz /></ProtectedRoute>} />
                <Route path="/admin/rooms" element={<ProtectedRoute requiredRole="admin"><AdminRooms /></ProtectedRoute>} />
                <Route path="/admin/settings" element={<ProtectedRoute requiredRole="admin"><AdminSettings /></ProtectedRoute>} />
                <Route path="/admin/users" element={<ProtectedRoute requiredRole="admin"><AdminUsers /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AppProvider>
        </Sentry.ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
