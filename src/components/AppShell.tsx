import { ReactNode } from "react";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";
import OnboardingTour from "./OnboardingTour";
import PersonaOnboarding from "./PersonaOnboarding";
import { useAlertNotifications } from "@/hooks/useAlertNotifications";
import { useWeeklyDigest } from "@/hooks/useWeeklyDigest";

export default function AppShell({ children }: { children: ReactNode }) {
  useAlertNotifications();
  useWeeklyDigest();
  return (
    <div className="min-h-screen bg-background mesh-bg pb-16 lg:pb-0">
      <TopBar />
      <main className="max-w-[1800px] mx-auto">{children}</main>
      <BottomNav />
      <OnboardingTour />
      <PersonaOnboarding />
    </div>
  );
}
