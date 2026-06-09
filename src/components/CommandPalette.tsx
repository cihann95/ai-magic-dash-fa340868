import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { useApp } from "@/contexts/AppContext";
import { t } from "@/lib/i18n";
import { SYMBOLS } from "@/lib/symbols";
import {
  LineChart, Wallet, History, Eye, Settings, Trophy, Award, Flame,
  Users, Brain, BookOpen, Activity, TrendingUp, Moon, Sun, Languages, LogOut, Zap,
} from "lucide-react";

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { lang, setLang, theme, setTheme, signOut, user } = useApp();
  const tr = t(lang);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName) && !(e.target as HTMLElement)?.isContentEditable) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onCustom = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onCustom);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onCustom);
    };
  }, []);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const pages: { path: string; label: string; icon: any }[] = [
    { path: "/", label: tr.markets, icon: LineChart },
    { path: "/blitz", label: "Blitz", icon: Zap },
    { path: "/portfolio", label: tr.portfolio, icon: Wallet },
    { path: "/insights", label: tr.insights, icon: Activity },
    { path: "/coach", label: tr.coach, icon: Brain },
    { path: "/journal", label: tr.journal, icon: BookOpen },
    { path: "/heatmap", label: tr.heatmap, icon: Flame },
    { path: "/social", label: tr.social, icon: Users },
    { path: "/watchlist", label: tr.watchlist, icon: Eye },
    { path: "/history", label: tr.history, icon: History },
    { path: "/leaderboard", label: tr.leaderboard, icon: Trophy },
    { path: "/achievements", label: tr.achievements, icon: Award },
    { path: "/settings", label: tr.settings, icon: Settings },
  ];

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={lang === "tr" ? "Sembol, sayfa veya komut ara..." : "Search symbols, pages or commands..."} />
      <CommandList>
        <CommandEmpty>{lang === "tr" ? "Sonuç bulunamadı." : "No results found."}</CommandEmpty>

        <CommandGroup heading={lang === "tr" ? "Semboller" : "Symbols"}>
          {SYMBOLS.slice(0, 40).map((s) => (
            <CommandItem
              key={s.symbol}
              value={`${s.symbol} ${s.name}`}
              onSelect={() => go(`/?symbol=${encodeURIComponent(s.symbol)}`)}
            >
              <TrendingUp className="size-4 mr-2 text-muted-foreground" />
              <span className="font-medium">{s.symbol}</span>
              <span className="ml-2 text-xs text-muted-foreground truncate">{s.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={lang === "tr" ? "Sayfalar" : "Pages"}>
          {pages.map((p) => (
            <CommandItem key={p.path} value={p.label} onSelect={() => go(p.path)}>
              <p.icon className="size-4 mr-2 text-muted-foreground" />
              {p.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={lang === "tr" ? "Komutlar" : "Commands"}>
          <CommandItem value="theme toggle" onSelect={() => { setTheme(theme === "dark" ? "light" : "dark"); setOpen(false); }}>
            {theme === "dark" ? <Sun className="size-4 mr-2" /> : <Moon className="size-4 mr-2" />}
            {lang === "tr" ? "Tema değiştir" : "Toggle theme"}
          </CommandItem>
          <CommandItem value="language toggle" onSelect={() => { setLang(lang === "tr" ? "en" : "tr"); setOpen(false); }}>
            <Languages className="size-4 mr-2" />
            {lang === "tr" ? "Dili değiştir (EN)" : "Switch language (TR)"}
          </CommandItem>
          {user && (
            <CommandItem value="signout" onSelect={async () => { await signOut(); setOpen(false); navigate("/auth"); }}>
              <LogOut className="size-4 mr-2" />
              {tr.signout}
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
