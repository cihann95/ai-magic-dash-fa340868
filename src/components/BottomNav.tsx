// Mobil için alt navigasyon - ana sayfalar arası hızlı geçiş
import { NavLink } from "react-router-dom";
import { LineChart, Wallet, Trophy, Settings, Users, Brain } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export default function BottomNav() {
  const { user, lang } = useApp();
  if (!user) return null;
  const tr = t(lang);
  const items = [
    { to: "/", label: tr.markets, icon: LineChart },
    { to: "/portfolio", label: tr.portfolio, icon: Wallet },
    { to: "/social", label: tr.social, icon: Users },
    { to: "/coach", label: tr.coach, icon: Brain },
    { to: "/settings", label: tr.settings, icon: Settings },
  ];
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 glass border-t border-border/40 px-2 pb-safe">
      <div className="flex items-center justify-around h-16">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"}
            className={({ isActive }) => cn(
              "flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] font-medium transition-colors",
              isActive ? "text-primary" : "text-muted-foreground"
            )}>
            <Icon className="size-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
