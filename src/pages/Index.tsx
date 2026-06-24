import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useApp } from "@/contexts/AppContext";
import { SYMBOLS, findSymbol } from "@/lib/symbols";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { t } from "@/lib/i18n";
import SymbolList from "@/components/trading/SymbolList";
import ChartPanel from "@/components/trading/ChartPanel";
import AccountAIPanel from "@/components/trading/AccountAIPanel";
import OpenPositionsPanel from "@/components/trading/OpenPositionsPanel";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { AnaSahne } from "@/components/AnaSahne";
import { useAnaSahne } from "@/hooks/useAnaSahne";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { hasFeature } from "@/lib/feature-flags";
import { ArrowRight, BarChart3, Brain, Globe, Layers, Sparkles } from "lucide-react";

function AnaSahneSection() {
  const { lang } = useApp();
  const tr = t(lang);
  const state = useAnaSahne();
  if (!state.isLoading && !state.room) return null;
  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold mb-3">{tr.live_now}</h2>
      <AnaSahne {...state} />
    </div>
  );
}

export default function Index() {
  const { user, lang } = useApp();
  const tr = t(lang);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initial = findSymbol(params.get("symbol") || "") || SYMBOLS[0];
  const [active, setActive] = useState(initial);
  const [refresh, setRefresh] = useState(0);
  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab] = useLocalStorage<string>("lumen-mobile-right-tab", "positions");

  useEffect(() => {
    const s = params.get("symbol");
    if (s) {
      const found = findSymbol(s);
      if (found) setActive(found);
    }
  }, [params]);

  if (!user) {
    return (
      <AppShell>
        {hasFeature('ana-sahne') && <AnaSahneSection />}
        <section className="px-6 py-20 md:py-32 max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full bg-primary/15 text-primary mb-6 animate-fade-in">
            <Brain className="size-3" /> {lang === "tr" ? "AI destekli işlem" : "AI-powered trading"}
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4 animate-fade-in">
            {tr.hero_title.split(" ").slice(0, -1).join(" ")} <span className="text-gradient">{tr.hero_title.split(" ").slice(-1)}</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8 animate-fade-in">{tr.hero_sub}</p>
          <div className="flex gap-3 justify-center animate-fade-in">
            <Button size="lg" onClick={() => navigate("/auth?mode=signup")} className="gradient-primary text-primary-foreground shadow-glow h-12 px-8">
              {tr.get_started} <ArrowRight className="size-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/auth")} className="h-12 px-8">
              {tr.signin}
            </Button>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 mt-20">
            {[
              { icon: BarChart3, t: lang === "tr" ? "Gerçek Zamanlı Grafikler" : "Real-time Charts", d: lang === "tr" ? "TradingView ile profesyonel teknik analiz" : "Pro charting with TradingView" },
              { icon: Brain, t: lang === "tr" ? "AI Analiz" : "AI Analysis", d: lang === "tr" ? "Sembol başına AL/SAT/BEKLE sinyalleri" : "BUY/SELL/HOLD signals per symbol" },
              { icon: Globe, t: lang === "tr" ? "Tüm Piyasalar" : "All Markets", d: lang === "tr" ? "Kripto, hisse, forex, emtia, endeks, ETF" : "Crypto, stocks, FX, commodities, indices, ETFs" },
            ].map((f, i) => (
              <div key={i} className="p-6 rounded-2xl glass border border-border/40 text-left">
                <div className="size-10 rounded-xl gradient-primary flex items-center justify-center mb-3">
                  <f.icon className="size-5 text-primary-foreground" />
                </div>
                <div className="font-semibold mb-1">{f.t}</div>
                <div className="text-sm text-muted-foreground">{f.d}</div>
              </div>
            ))}
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_380px] gap-3 p-3 pb-24 lg:pb-3 h-auto lg:h-[calc(100vh-4rem)]">
        <aside className="rounded-2xl glass border border-border/40 shadow-card overflow-hidden order-2 lg:order-1 min-h-[400px] lg:min-h-0">
          <SymbolList active={active} onSelect={setActive} />
        </aside>
        <section className="rounded-2xl glass border border-border/40 shadow-card overflow-hidden order-1 lg:order-2 min-h-[600px] lg:min-h-0">
          <ChartPanel symbol={active} onTradeDone={() => setRefresh((r) => r + 1)} />
        </section>
        <aside className="order-3 min-h-[600px] lg:min-h-0 flex flex-col">
          {isMobile ? (
            <Tabs value={mobileTab} onValueChange={setMobileTab} className="flex flex-col flex-1 min-h-0">
              <TabsList className="grid grid-cols-2 m-3 mb-0 shrink-0">
                <TabsTrigger value="positions" className="text-xs gap-1"><Layers className="size-3" />{tr.open_positions}</TabsTrigger>
                <TabsTrigger value="ai" className="text-xs gap-1"><Sparkles className="size-3" />AI</TabsTrigger>
              </TabsList>
              <TabsContent value="positions" className="flex-1 min-h-0 m-0 mt-2 p-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col data-[state=inactive]:hidden">
                <OpenPositionsPanel
                  refreshKey={refresh}
                  onTradeDone={() => setRefresh((r) => r + 1)}
                  onSelectSymbol={setActive}
                  activeSymbol={active.symbol}
                />
              </TabsContent>
              <TabsContent value="ai" className="flex-1 min-h-0 m-0 mt-2 p-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col data-[state=inactive]:hidden">
                <AccountAIPanel symbol={active} refreshKey={refresh} onTradeDone={() => setRefresh((r) => r + 1)} />
              </TabsContent>
            </Tabs>
          ) : (
            <ResizablePanelGroup direction="vertical" className="flex-1 min-h-0">
              <ResizablePanel defaultSize={52} minSize={28} className="flex flex-col min-h-0">
                <OpenPositionsPanel
                  refreshKey={refresh}
                  onTradeDone={() => setRefresh((r) => r + 1)}
                  onSelectSymbol={setActive}
                  activeSymbol={active.symbol}
                />
              </ResizablePanel>
              <ResizableHandle withHandle className="my-1" />
              <ResizablePanel defaultSize={48} minSize={24} className="flex flex-col min-h-0">
                <AccountAIPanel symbol={active} refreshKey={refresh} onTradeDone={() => setRefresh((r) => r + 1)} />
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
