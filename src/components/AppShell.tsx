import { ReactNode } from "react";
import TopBar from "./TopBar";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background mesh-bg">
      <TopBar />
      <main className="max-w-[1800px] mx-auto">{children}</main>
    </div>
  );
}
