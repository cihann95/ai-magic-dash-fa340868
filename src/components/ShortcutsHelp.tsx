import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApp } from "@/contexts/AppContext";

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded border border-border bg-muted/60 text-foreground">
    {children}
  </kbd>
);

export default function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const { lang } = useApp();

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("show-shortcuts-help", handler);
    return () => window.removeEventListener("show-shortcuts-help", handler);
  }, []);

  const items = [
    { keys: [<><Kbd>⌘</Kbd>/<Kbd>Ctrl</Kbd> + <Kbd>K</Kbd></>], label: lang === "tr" ? "Komut paleti" : "Command palette" },
    { keys: [<Kbd>/</Kbd>], label: lang === "tr" ? "Sembol ara" : "Search symbol" },
    { keys: [<Kbd>g</Kbd>, <Kbd>h</Kbd>], label: lang === "tr" ? "Piyasalar" : "Markets" },
    { keys: [<Kbd>g</Kbd>, <Kbd>p</Kbd>], label: lang === "tr" ? "Portföy" : "Portfolio" },
    { keys: [<Kbd>g</Kbd>, <Kbd>i</Kbd>], label: lang === "tr" ? "İçgörüler" : "Insights" },
    { keys: [<Kbd>g</Kbd>, <Kbd>j</Kbd>], label: lang === "tr" ? "Günlük" : "Journal" },
    { keys: [<Kbd>g</Kbd>, <Kbd>c</Kbd>], label: lang === "tr" ? "Coach" : "Coach" },
    { keys: [<Kbd>g</Kbd>, <Kbd>w</Kbd>], label: lang === "tr" ? "İzleme listesi" : "Watchlist" },
    { keys: [<Kbd>?</Kbd>], label: lang === "tr" ? "Bu yardım" : "This help" },
    { keys: [<Kbd>Esc</Kbd>], label: lang === "tr" ? "Diyalogları kapat" : "Close dialogs" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{lang === "tr" ? "Klavye Kısayolları" : "Keyboard Shortcuts"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-border/30 last:border-0">
              <span className="text-muted-foreground">{it.label}</span>
              <span className="flex items-center gap-1">
                {it.keys.map((k, j) => <span key={j}>{k}</span>)}
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
