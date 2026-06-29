import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { callEdgeFunction } from "@/lib/edge-error";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { Moon, Sun, RotateCcw, Bell, Download, Users, Wallet, Info, Diamond, TrendingUp, Key, CheckCircle2, XCircle, RefreshCw, Loader2 } from "lucide-react";
import { enablePushNotifications, disablePushNotifications } from "@/lib/pushSubscribe";
import { getAllProviders, getBrokerConfig, saveBrokerConfig, clearBrokerConfig, getActiveExchangeId, setActiveExchangeId, onActiveExchangeChange } from "@/lib/exchange-provider";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ""; // Server tarafından enjekte edilecek; boşsa push devre dışı

interface LedgerEntry {
  id: string;
  amount: number;
  reason: string | null;
  created_at: string;
  granted_by_name: string | null;
}

function SettingsInner() {
  const { user, lang, setLang, theme, setTheme, realBalance, realBalanceLocked, subscription, subscriptionLoading } = useApp();
  const tr = t(lang);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<{ prompt(): Promise<{ outcome: string }>; userChoice: Promise<{ outcome: string }> } | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // Broker state
  const brokers = getAllProviders();
  const [brokerExchange, setBrokerExchange] = useState(getActiveExchangeId());
  const [brokerApiKey, setBrokerApiKey] = useState("");
  const [brokerSecret, setBrokerSecret] = useState("");
  const [brokerTesting, setBrokerTesting] = useState(false);
  const [brokerTestResult, setBrokerTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  useEffect(() => {
    const cfg = getBrokerConfig(brokerExchange);
    if (cfg) { setBrokerApiKey(cfg.apiKey); setBrokerSecret(cfg.secret); }
    else { setBrokerApiKey(""); setBrokerSecret(""); }
    setBrokerTestResult(null);
  }, [brokerExchange]);

  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);

  // Public profile state
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [pubActive, setPubActive] = useState(false);
  const [showTrades, setShowTrades] = useState(false);
  const [showPortfolio, setShowPortfolio] = useState(false);
  const [copyable, setCopyable] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: prof } = await supabase.from("profiles").select("display_name").eq("id", user.id).single();
      if (prof) setDisplayName(prof.display_name || "");

      const { data: pp } = await supabase.from("public_profiles")
        .select("username, bio, is_active, show_trades, show_portfolio, copyable")
        .eq("user_id", user.id).maybeSingle();
      if (pp) {
        setUsername(pp.username); setBio(pp.bio || "");
        setPubActive(pp.is_active); setShowTrades(pp.show_trades);
        setShowPortfolio(pp.show_portfolio); setCopyable(pp.copyable ?? false);
      }

      // Push state
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        setPushOn(!!sub);
      }
      setProfileLoading(false);
    })();

    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e as unknown as { prompt(): Promise<{ outcome: string }>; userChoice: Promise<{ outcome: string }> }); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [user]);

  const fetchLedger = async () => {
    if (!user) return;
    setLedgerLoading(true);
    const { data } = await supabase
      .from("real_balance_ledger" as never)
      .select("id, amount, reason, created_at, granted_by:profiles(display_name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) {
      setLedger(
        (data as unknown as { id: string; amount: number; reason: string | null; created_at: string; granted_by: { display_name: string } | null }[]).map((r) => ({
          id: r.id,
          amount: r.amount,
          reason: r.reason,
          created_at: r.created_at,
          granted_by_name: r.granted_by?.display_name ?? null,
        }))
      );
    }
    setLedgerLoading(false);
  };

  useEffect(() => {
    fetchLedger();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`ledger_${user.id}`)
      .on(
        "postgres_changes" as never,
        { event: "INSERT", schema: "public", table: "real_balance_ledger", filter: `user_id=eq.${user.id}` } as never,
        () => { fetchLedger(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      display_name: displayName, preferred_language: lang, preferred_theme: theme,
    }).eq("id", user.id);
    setSaving(false);
    toast({ title: error ? tr.error : tr.success, description: error?.message, variant: error ? "destructive" : "default" });
  };

  const savePublic = async () => {
    if (!user) return;
    if (!username || username.length < 3) {
      toast({ title: lang === "tr" ? "Kullanıcı adı en az 3 karakter" : "Username min 3 chars", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("public_profiles").upsert({
      user_id: user.id, username, bio,
      is_active: pubActive, show_trades: showTrades, show_portfolio: showPortfolio,
      copyable,
    }, { onConflict: "user_id" });
    setSaving(false);
    toast({ title: error ? tr.error : tr.success, description: error?.message, variant: error ? "destructive" : "default" });
  };

  const resetDemo = async () => {
    if (!user) return;
    setResetting(true);
    try {
      await callEdgeFunction("reset-demo-account", {});
      toast({
        title: tr.success,
        description: lang === "tr" ? "Demo bakiyesi sıfırlandı." : "Demo balance reset.",
      });
    } catch {
      // Toast already shown by callEdgeFunction
    } finally {
      setResetting(false);
    }
  };

  const togglePush = async () => {
    if (pushOn) {
      await disablePushNotifications(); setPushOn(false);
      toast({ title: lang === "tr" ? "Push kapatıldı" : "Push disabled" });
    } else {
      if (!VAPID_PUBLIC_KEY) {
        toast({
          title: lang === "tr" ? "Push henüz hazır değil" : "Push not ready yet",
          description: lang === "tr" ? "Yönetici VAPID anahtarını eklemeli." : "Admin must add VAPID key.",
          variant: "destructive",
        });
        return;
      }
      const r = await enablePushNotifications(VAPID_PUBLIC_KEY);
      setPushOn(r.ok);
      toast({
        title: r.ok ? (lang === "tr" ? "Push aktif" : "Push enabled") : (lang === "tr" ? "Push başarısız" : "Push failed"),
        description: r.reason,
        variant: r.ok ? "default" : "destructive",
      });
    }
  };

  const installApp = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return (
    <AppShell>
      <main role="main" aria-label="Settings" className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">{tr.settings}</h1>

        {profileLoading ? (
          <>
            <Card className="p-6 glass border-border/40 space-y-4">
              <Skeleton className="h-5 w-24" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
              <Skeleton className="h-10 w-24" />
            </Card>
            <Card className="p-6 glass border-border/40 space-y-4">
              <Skeleton className="h-5 w-32" />
              <div className="grid grid-cols-3 gap-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            </Card>
          </>
        ) : (
          <>
            <Card className="p-6 glass border-border/40 space-y-4">
              <h2 className="font-semibold">{tr.profile}</h2>
              <div className="space-y-2">
                <Label>{tr.email}</Label>
                <Input value={user?.email || ""} disabled />
              </div>
              <div className="space-y-2">
                <Label>{tr.display_name}</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </div>
              <Button onClick={saveProfile} disabled={saving} className="gradient-primary text-primary-foreground">{tr.save}</Button>
            </Card>

            <Card className="p-6 glass border-border/40 space-y-4">
              <h2 className="font-semibold flex items-center gap-2"><Users className="size-4" /> {tr.public_profile}</h2>
              <div className="space-y-2">
                <Label>{tr.username}</Label>
                <Input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="trader_x" />
              </div>
              <div className="space-y-2">
                <Label>{tr.bio}</Label>
                <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} />
              </div>
              <div className="flex items-center justify-between"><Label>{tr.activate_public}</Label><Switch checked={pubActive} onCheckedChange={setPubActive} /></div>
              <div className="flex items-center justify-between"><Label>{lang === "tr" ? "İşlemleri göster" : "Show trades"}</Label><Switch checked={showTrades} onCheckedChange={setShowTrades} /></div>
              <div className="flex items-center justify-between"><Label>{lang === "tr" ? "Portföyü göster" : "Show portfolio"}</Label><Switch checked={showPortfolio} onCheckedChange={setShowPortfolio} /></div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>{lang === "tr" ? "Kopyalanmaya izin ver" : "Allow copy-trading"}</Label>
                  <p className="text-[11px] text-muted-foreground">{lang === "tr" ? "Diğer kullanıcılar işlemlerini otomatik kopyalayabilir." : "Others can auto-copy your trades."}</p>
                </div>
                <Switch checked={copyable} onCheckedChange={setCopyable} />
              </div>
              <Button onClick={savePublic} disabled={saving} className="gradient-primary text-primary-foreground">{tr.save}</Button>
            </Card>
          </>
        )}

        <Card className="p-6 glass border-border/40 space-y-4">
          <h2 className="font-semibold">{tr.theme} & {tr.language}</h2>
          <div className="flex gap-3 flex-wrap">
            <Button variant={theme === "dark" ? "default" : "outline"} onClick={() => setTheme("dark")} className="flex-1 min-w-[80px]"><Moon className="size-4" /> {tr.dark}</Button>
            <Button variant={theme === "light" ? "default" : "outline"} onClick={() => setTheme("light")} className="flex-1 min-w-[80px]"><Sun className="size-4" /> {tr.light}</Button>
            {(subscription?.plan !== "free" || (subscription?.trial_ends_at && new Date(subscription.trial_ends_at) > new Date())) ? (
              <Button variant={theme === "gold" ? "default" : "outline"} onClick={() => setTheme("gold")}
                className="flex-1 min-w-[80px]"
                style={theme === "gold" ? { background: "linear-gradient(135deg, #FFD700, #FFA500)", color: "#7c3a00" } : {}}
              >
                <Diamond className="size-4" /> Altın
              </Button>
            ) : (
              <Button variant="outline" disabled className="flex-1 min-w-[80px] opacity-50">
                <Diamond className="size-4" /> Altın
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant={lang === "tr" ? "default" : "outline"} onClick={() => setLang("tr")} className="flex-1">Türkçe</Button>
            <Button variant={lang === "en" ? "default" : "outline"} onClick={() => setLang("en")} className="flex-1">English</Button>
          </div>
        </Card>

        <Card className="p-6 glass border-border/40 space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><Bell className="size-4" /> {tr.notifications}</h2>
          <div className="flex items-center justify-between">
            <div>
              <Label>{pushOn ? tr.disable_push : tr.enable_push}</Label>
              <p className="text-[11px] text-muted-foreground">
                {lang === "tr" ? "Telefon ve masaüstüne anlık bildirim alın." : "Get instant notifications on phone and desktop."}
              </p>
            </div>
            <Switch checked={pushOn} onCheckedChange={togglePush} />
          </div>
          {installPrompt && (
            <Button onClick={installApp} variant="outline" className="w-full">
              <Download className="size-4" /> {tr.install_app}
            </Button>
          )}
          {!installPrompt && /iPhone|iPad|iPod/.test(navigator.userAgent) && (
            <div className="rounded-lg border border-border/40 bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <Download className="size-3.5" /> iOS: Add to Home Screen
              </p>
              <p>1. Tap the Share button <span className="font-mono">⎙</span> in Safari.</p>
              <p>2. Scroll down and tap <strong>"Add to Home Screen"</strong>.</p>
              <p>3. Tap <strong>"Add"</strong> in the top right.</p>
            </div>
          )}
        </Card>

        <Card className="p-6 glass border-border/40 space-y-4">
          <h2 className="font-semibold flex items-center gap-2"><Wallet className="size-4" /> {lang === "tr" ? "Gerçek Bakiye" : "Real Balance"}</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-[11px] text-muted-foreground">{lang === "tr" ? "Mevcut Bakiye" : "Available"}</p>
              <p className="text-lg font-bold">${(realBalance - realBalanceLocked).toFixed(2)}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-[11px] text-muted-foreground">{lang === "tr" ? "Toplam Bakiye" : "Total Balance"}</p>
              <p className="text-lg font-bold">${realBalance.toFixed(2)}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-[11px] text-muted-foreground">{lang === "tr" ? "Kilitli" : "Locked"}</p>
              <p className="text-lg font-bold">${realBalanceLocked.toFixed(2)}</p>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-border/40 bg-muted/30 p-3 text-sm text-muted-foreground">
            <Info className="size-4 mt-0.5 shrink-0" />
            <span>{lang === "tr" ? "Bakiyeniz yönetici tarafından yüklenir. Detaylı bilgi için destek ile iletişime geçin." : "Balance is loaded by admin. Contact support for details."}</span>
          </div>
        </Card>

        <Card className="p-6 glass border-border/40 space-y-4">
          <h2 className="font-semibold">{lang === "tr" ? "Bakiye Geçmişi" : "Balance History"}</h2>
          {ledgerLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{lang === "tr" ? "Henüz işlem yok" : "No transactions yet"}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{lang === "tr" ? "Tarih" : "Date"}</TableHead>
                  <TableHead>{lang === "tr" ? "Miktar" : "Amount"}</TableHead>
                  <TableHead>{lang === "tr" ? "Açıklama" : "Reason"}</TableHead>
                  <TableHead>{lang === "tr" ? "Yükleyen" : "Granted by"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-xs">{new Date(entry.created_at).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-US", { day: "2-digit", month: "2-digit", year: "2-digit" })}</TableCell>
                    <TableCell className={entry.amount >= 0 ? "text-bull font-medium" : "text-bear font-medium"}>
                      {entry.amount >= 0 ? "+" : ""}${entry.amount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{entry.reason || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{entry.granted_by_name || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card className="p-6 glass border-border/40 space-y-4">
          <h2 className="font-semibold flex items-center gap-2"><Key className="size-4" /> {lang === "tr" ? "Broker" : "Broker"}</h2>

          {/* Exchange selector */}
          <div className="space-y-2">
            <Label>{lang === "tr" ? "Borsa" : "Exchange"}</Label>
            <select
              value={brokerExchange}
              onChange={(e) => setBrokerExchange(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Connection status */}
          {(() => {
            const p = brokers.find((b) => b.id === brokerExchange);
            const cfg = getBrokerConfig(brokerExchange);
            return cfg || p?.isConnected() ? (
              <div className="flex items-center gap-2 text-sm text-bull">
                <CheckCircle2 className="size-4" />
                <span>{lang === "tr" ? "Bağlı" : "Connected"}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <XCircle className="size-4" />
                <span>{lang === "tr" ? "Bağlı değil" : "Not connected"}</span>
              </div>
            );
          })()}

          {/* API Key & Secret inputs */}
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              value={brokerApiKey}
              onChange={(e) => setBrokerApiKey(e.target.value)}
              placeholder={lang === "tr" ? "API anahtarı" : "API key"}
            />
          </div>
          <div className="space-y-2">
            <Label>API Secret</Label>
            <Input
              type="password"
              value={brokerSecret}
              onChange={(e) => setBrokerSecret(e.target.value)}
              placeholder={lang === "tr" ? "Gizli anahtar" : "Secret"}
            />
          </div>

          {/* Test + Save buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={brokerTesting || !brokerApiKey || !brokerSecret}
              onClick={async () => {
                setBrokerTesting(true);
                setBrokerTestResult(null);
                const p = brokers.find((b) => b.id === brokerExchange);
                if (p) {
                  const result = await p.testConnection({ apiKey: brokerApiKey, secret: brokerSecret });
                  setBrokerTestResult(result);
                  if (result.ok) {
                    toast({ title: lang === "tr" ? "Bağlantı başarılı" : "Connection successful" });
                  } else {
                    toast({ title: lang === "tr" ? "Bağlantı başarısız" : "Connection failed", description: result.error, variant: "destructive" });
                  }
                }
                setBrokerTesting(false);
              }}
            >
              {brokerTesting ? <Loader2 className="size-4 animate-spin mr-1" /> : <RefreshCw className="size-4 mr-1" />}
              {lang === "tr" ? "Test Bağlantısı" : "Test Connection"}
            </Button>

            <Button
              onClick={() => {
                saveBrokerConfig(brokerExchange, brokerApiKey, brokerSecret);
                setActiveExchangeId(brokerExchange);
                toast({ title: lang === "tr" ? "Kaydedildi" : "Saved" });
              }}
              disabled={!brokerApiKey && !brokerSecret}
            >
              {tr.save}
            </Button>

            <Button
              variant="destructive"
              onClick={() => {
                clearBrokerConfig(brokerExchange);
                setBrokerApiKey("");
                setBrokerSecret("");
                setBrokerTestResult(null);
                toast({ title: lang === "tr" ? "Temizlendi" : "Cleared" });
              }}
              disabled={!getBrokerConfig(brokerExchange)}
            >
              {lang === "tr" ? "Temizle" : "Clear"}
            </Button>
          </div>

          {brokerTestResult && (
            <div className={`text-sm flex items-center gap-1 ${brokerTestResult.ok ? "text-bull" : "text-bear"}`}>
              {brokerTestResult.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
              {brokerTestResult.ok
                ? (lang === "tr" ? "Bağlantı başarılı" : "Connection successful")
                : brokerTestResult.error}
            </div>
          )}
        </Card>

        <Card className="p-6 glass border-border/40 space-y-3">
          <h2 className="font-semibold">{tr.reset_demo}</h2>
          <p className="text-sm text-muted-foreground">{tr.reset_demo_desc}</p>
          <Button variant="outline" onClick={resetDemo} disabled={resetting}>
            <RotateCcw className="size-4" /> {tr.reset_demo}
          </Button>
        </Card>

        {/* Premium Section */}
        <Card className="p-6 glass border-border/40 space-y-4"
          style={subscription && subscription.plan !== "free" ? { border: "1px solid hsl(45 100% 50% / 0.3)", boxShadow: "0 0 12px hsl(45 100% 50% / 0.15)" } : {}}
        >
          <h2 className="font-semibold flex items-center gap-2">
            <Diamond className="size-4" style={{ color: "#FFD700" }} />
            Premium
          </h2>

          {subscriptionLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <>
              {/* Trial banner */}
              {subscription && subscription.trial_ends_at && new Date(subscription.trial_ends_at) > new Date() && (
                <div className="rounded-lg bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 p-3 text-sm">
                  <p className="font-semibold text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                    <Diamond className="size-3.5" />
                    {lang === "tr" ? "Deneme Süresi Devam Ediyor" : "Trial Period Active"}
                  </p>
                  <p className="text-muted-foreground mt-1">
                    {lang === "tr"
                      ? `${Math.ceil((new Date(subscription.trial_ends_at).getTime() - Date.now()) / 86400000)} gün kaldı`
                      : `${Math.ceil((new Date(subscription.trial_ends_at).getTime() - Date.now()) / 86400000)} days remaining`}
                  </p>
                </div>
              )}

              {/* Plan comparison */}
              <div className="grid grid-cols-3 gap-3">
                {(["free", "pro", "elite"] as const).map((plan) => {
                  const isCurrent = subscription?.plan === plan;
                  const isPremium = plan !== "free";
                  return (
                    <div key={plan} className={`rounded-lg p-3 text-center ${isCurrent ? "ring-2 ring-primary/50 bg-accent/30" : "bg-muted/30"}`}
                      style={isCurrent && isPremium ? { ring: "2px solid hsl(45 100% 50% / 0.5)", background: "linear-gradient(135deg, hsl(45 100% 50% / 0.08), hsl(35 100% 55% / 0.05))" } : {}}
                    >
                      <p className="text-sm font-bold capitalize">{plan}</p>
                      {plan === "free" && <p className="text-[10px] text-muted-foreground mt-1">{lang === "tr" ? "5 analiz/gün" : "5 analysis/day"}</p>}
                      {plan === "pro" && <p className="text-[10px] text-muted-foreground mt-1">{lang === "tr" ? "Sınırsız analiz + Altın tema" : "Unlimited analysis + Gold theme"}</p>}
                      {plan === "elite" && <p className="text-[10px] text-muted-foreground mt-1">{lang === "tr" ? "Her şey dahil + API" : "Everything + API"}</p>}
                      {isCurrent && (
                        <p className="text-[10px] font-bold text-primary mt-1">
                          {lang === "tr" ? "Aktif" : "Active"}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Upgrade CTA for free users */}
              {(!subscription || subscription.plan === "free") && (
                <Button className="w-full"
                  style={{ background: "linear-gradient(135deg, #FFD700, #FFA500)", color: "#7c3a00" }}
                >
                  <TrendingUp className="size-4" />
                  {lang === "tr" ? "Premium'a Yükselt" : "Upgrade to Premium"}
                </Button>
              )}
            </>
          )}
        </Card>
      </main>
    </AppShell>
  );
}

export default function Settings() { return <ProtectedRoute><SettingsInner /></ProtectedRoute>; }
