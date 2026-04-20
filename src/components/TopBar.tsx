import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Moon, Sun, LineChart, Wallet, History, Eye, Settings, LogOut, Menu, X, Trophy, Award, Flame } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useState } from "react";
import GameBadge from "./GameBadge";
import NotificationBell from "./NotificationBell";

const navItems = (lang: "tr" | "en") => [
  { to: "/", label: t(lang).markets, icon: LineChart },
  { to: "/heatmap", label: t(lang).heatmap, icon: Flame },
  { to: "/portfolio", label: t(lang).portfolio, icon: Wallet },
  { to: "/history", label: t(lang).history, icon: History },
  { to: "/watchlist", label: t(lang).watchlist, icon: Eye },
  { to: "/leaderboard", label: t(lang).leaderboard, icon: Trophy },
  { to: "/achievements", label: t(lang).achievements, icon: Award },
  { to: "/settings", label: t(lang).settings, icon: Settings },
];

export default function TopBar() {
  const { user, lang, setLang, theme, setTheme, signOut } = useApp();
  const navigate = useNavigate();
  const loc = useLocation();
  const tr = t(lang);
  const [mobileOpen, setMobileOpen] = useState(false);

  const items = navItems(lang);

  return (
    <header className="sticky top-0 z-50 glass border-b border-border/40">
      <div className="flex items-center justify-between px-4 md:px-6 h-16 max-w-[1800px] mx-auto">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
            <div className="size-8 rounded-lg gradient-primary shadow-glow flex items-center justify-center">
              <LineChart className="size-4 text-primary-foreground" />
            </div>
            <span className="text-gradient hidden sm:inline">Lumen Trade</span>
          </Link>
          <nav className="hidden lg:flex items-center gap-1">
            {items.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end={to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`
                }>
                <Icon className="size-4" />{label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {user && <NotificationBell />}
          {user && <GameBadge />}
          <Button variant="ghost" size="sm" onClick={() => setLang(lang === "tr" ? "en" : "tr")} className="font-mono text-xs uppercase">
            {lang}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full gradient-primary text-primary-foreground font-semibold">
                  {(user.email?.[0] || "U").toUpperCase()}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-3 py-2 text-xs text-muted-foreground truncate">{user.email}</div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  <Settings className="size-4 mr-2" />{tr.settings}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={async () => { await signOut(); navigate("/auth"); }}>
                  <LogOut className="size-4 mr-2" />{tr.signout}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="hidden sm:flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigate("/auth")}>{tr.signin}</Button>
              <Button size="sm" className="gradient-primary text-primary-foreground shadow-glow" onClick={() => navigate("/auth?mode=signup")}>{tr.signup}</Button>
            </div>
          )}
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="lg:hidden border-t border-border/40 px-4 py-3 flex flex-col gap-1 bg-background/95">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/"} onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${
                  isActive ? "bg-accent" : "text-muted-foreground"
                }`
              }>
              <Icon className="size-4" />{label}
            </NavLink>
          ))}
          {!user && (
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => { navigate("/auth"); setMobileOpen(false); }}>{tr.signin}</Button>
              <Button className="flex-1 gradient-primary text-primary-foreground" onClick={() => { navigate("/auth?mode=signup"); setMobileOpen(false); }}>{tr.signup}</Button>
            </div>
          )}
        </nav>
      )}
    </header>
  );
}
