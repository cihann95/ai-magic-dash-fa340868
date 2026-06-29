import { ReactNode } from "react";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";
import UnifiedOnboarding from "./UnifiedOnboarding";
import CommandPalette from "./CommandPalette";
import ShortcutsHelp from "./ShortcutsHelp";
import { useAlertNotifications } from "@/hooks/useAlertNotifications";
import { useWeeklyDigest } from "@/hooks/useWeeklyDigest";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

export default function AppShell({ children }: { children: ReactNode }) {
  useAlertNotifications();
  useWeeklyDigest();
  useKeyboardShortcuts();
  return (
    <div className="min-h-screen bg-background mesh-bg pb-16 lg:pb-0">
      <TopBar />
      <main className="max-w-[1800px] mx-auto">{children}</main>
      <BottomNav />
      <UnifiedOnboarding />
      <CommandPalette />
      <ShortcutsHelp />
    </div>
  );
}
