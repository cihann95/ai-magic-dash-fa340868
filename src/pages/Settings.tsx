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
import { Moon, Sun, RotateCcw, Bell, Download, Users, Wallet, Info } from "lucide-react";
import { enablePushNotifications, disablePushNotifications } from "@/lib/pushSubscribe";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ""; // Server tarafından enjekte edilecek; boşsa push devre dışı

interface LedgerEntry {
  id: string;
  amount: number;
  reason: string | null;
  created_at: string;
  granted_by_name: string | null;
}

function SettingsInner() {
  const { user, lang, setLang, theme, setTheme, realBalance, realBalanceLocked } = useApp();
  const tr = t(lang);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<{ prompt(): Promise<{ outcome: string }>; userChoice: Promise<{ outcome: string }> } | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

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
          <div className="flex gap-3">
            <Button variant={theme === "dark" ? "default" : "outline"} onClick={() => setTheme("dark")} className="flex-1"><Moon className="size-4" /> {tr.dark}</Button>
            <Button variant={theme === "light" ? "default" : "outline"} onClick={() => setTheme("light")} className="flex-1"><Sun className="size-4" /> {tr.light}</Button>
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
                    <TableCell className={entry.amount >= 0 ? "text-green-500 font-medium" : "text-red-500 font-medium"}>
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

        <Card className="p-6 glass border-border/40 space-y-3">
          <h2 className="font-semibold">{tr.reset_demo}</h2>
          <p className="text-sm text-muted-foreground">{tr.reset_demo_desc}</p>
          <Button variant="outline" onClick={resetDemo} disabled={resetting}>
            <RotateCcw className="size-4" /> {tr.reset_demo}
          </Button>
        </Card>
      </main>
    </AppShell>
  );
}

export default function Settings() { return <ProtectedRoute><SettingsInner /></ProtectedRoute>; }
