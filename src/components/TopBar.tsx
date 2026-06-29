import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  Moon, Sun, LineChart, Wallet, History, Eye, Settings, LogOut, Menu, X,
  Trophy, Award, Flame, Users, Brain, BookOpen, Activity, Search, MoreHorizontal, Keyboard, Zap, TrendingUp,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import GameBadge from "./GameBadge";
import StreakBadge from "./StreakBadge";
import NotificationBell from "./NotificationBell";

const primaryItems = (lang: "tr" | "en") => [
  { to: "/", label: t(lang).markets, icon: LineChart },
  { to: "/portfolio", label: t(lang).portfolio, icon: Wallet },
  { to: "/insights", label: t(lang).insights, icon: Activity },
  { to: "/coach", label: t(lang).coach, icon: Brain },
  { to: "/journal", label: t(lang).journal, icon: BookOpen },
];

const moreItems = (lang: "tr" | "en") => [
  { to: "/heatmap", label: t(lang).heatmap, icon: Flame },
  { to: "/social", label: t(lang).social, icon: Users },
  { to: "/watchlist", label: t(lang).watchlist, icon: Eye },
  { to: "/history", label: t(lang).history, icon: History },
  { to: "/leaderboard", label: t(lang).leaderboard, icon: Trophy },
  { to: "/achievements", label: t(lang).achievements, icon: Award },
];

export default function TopBar() {
  const { user, lang, setLang, theme, setTheme, signOut, isAdmin } = useApp();
  const navigate = useNavigate();
  const loc = useLocation();
  const tr = t(lang);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileSearchText, setMobileSearchText] = useState("");

  const items = primaryItems(lang);
  const more = moreItems(lang);
  const allItems = [...items, ...more];
  const isMoreActive = more.some((m) => loc.pathname === m.to);

  const openPalette = () => window.dispatchEvent(new CustomEvent("open-command-palette"));

  return (
    <header className="sticky top-0 z-50 glass border-b border-border/40">
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 h-16 max-w-[1800px] mx-auto">
        <div className="flex items-center gap-6 min-w-0">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg tracking-tight shrink-0">
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`gap-1.5 h-9 px-3 ${isMoreActive ? "bg-accent text-foreground" : "text-muted-foreground"}`}
                >
                  <MoreHorizontal className="size-4" />
                  {lang === "tr" ? "Daha fazla" : "More"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 bg-popover">
                {more.map(({ to, label, icon: Icon }) => (
                  <DropdownMenuItem key={to} onClick={() => navigate(to)} className="gap-2">
                    <Icon className="size-4 text-muted-foreground" />
                    <span>{label}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => window.dispatchEvent(new CustomEvent("show-shortcuts-help"))} className="gap-2">
                  <Keyboard className="size-4 text-muted-foreground" />
                  <span>{lang === "tr" ? "Kısayollar" : "Shortcuts"}</span>
                  <kbd className="ml-auto text-[10px] font-mono px-1 py-0.5 rounded bg-muted">?</kbd>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {user && (
            <button
              onClick={openPalette}
              className="hidden md:flex items-center gap-2 px-3 h-9 rounded-lg border border-border/60 bg-muted/30 hover:bg-muted/60 text-muted-foreground text-xs transition-colors w-56"
              aria-label={lang === "tr" ? "Ara" : "Search"}
            >
              <Search className="size-3.5" />
              <span className="flex-1 text-left">{lang === "tr" ? "Sembol ara..." : "Search symbols..."}</span>
              <kbd className="text-[10px] font-mono px-1 py-0.5 rounded bg-background/60 border border-border/40">⌘K</kbd>
            </button>
          )}
          {user && !mobileSearchOpen && (
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileSearchOpen(true)} aria-label="Search">
              <Search className="size-4" />
            </Button>
          )}
          {user && mobileSearchOpen && (
            <div className="md:hidden flex items-center gap-1">
              <div className="relative flex items-center">
                <Search className="size-3.5 absolute left-2 text-muted-foreground pointer-events-none" />
                <input
                  autoFocus
                  type="text"
                  value={mobileSearchText}
                  onChange={(e) => setMobileSearchText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setMobileSearchOpen(false);
                      setMobileSearchText("");
                      openPalette();
                    }
                  }}
                  placeholder={lang === "tr" ? "Ara..." : "Search..."}
                  className="h-8 w-36 pl-7 pr-6 rounded-lg border border-border/60 bg-muted/30 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/50"
                />
                {mobileSearchText && (
                  <button
                    onClick={() => setMobileSearchText("")}
                    className="absolute right-1.5 p-0.5 rounded-full text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
              <Button variant="ghost" size="icon" className="size-8" onClick={() => { setMobileSearchOpen(false); setMobileSearchText(""); }}>
                <X className="size-4" />
              </Button>
            </div>
          )}
          {user && <NotificationBell />}
          {user && <GameBadge />}
          {user && <StreakBadge />}
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
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Admin Panel
                    </div>
                    <DropdownMenuItem onClick={() => navigate("/admin/users")} className="gap-2">
                      <Users className="size-4 text-muted-foreground" />
                      <span>{lang === "tr" ? "Kullanıcılar" : "Users"}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/admin/rooms")} className="gap-2">
                      <Zap className="size-4 text-muted-foreground" />
                      <span>{lang === "tr" ? "Blitz Odaları" : "Blitz Rooms"}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/admin/settings")} className="gap-2">
                      <Settings className="size-4 text-muted-foreground" />
                      <span>{lang === "tr" ? "Sistem Ayarları" : "System Settings"}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/admin/blitz")} className="gap-2">
                      <TrendingUp className="size-4 text-muted-foreground" />
                      <span>Revenue</span>
                    </DropdownMenuItem>
                  </>
                )}
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
          {allItems.map(({ to, label, icon: Icon }) => (
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
