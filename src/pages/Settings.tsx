import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Moon, Sun, RotateCcw, Bell, Download, Users } from "lucide-react";
import { enablePushNotifications, disablePushNotifications } from "@/lib/pushSubscribe";

const VAPID_PUBLIC_KEY = ""; // Server tarafından enjekte edilecek; boşsa push devre dışı

function SettingsInner() {
  const { user, lang, setLang, theme, setTheme } = useApp();
  const tr = t(lang);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);

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
        setShowPortfolio(pp.show_portfolio); setCopyable((pp as any).copyable ?? false);
      }

      // Push state
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        setPushOn(!!sub);
      }
    })();

    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
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
    const { error } = await supabase.functions.invoke("reset-demo-account");
    setResetting(false);
    toast({
      title: error ? tr.error : tr.success,
      description: error?.message || (lang === "tr" ? "Demo bakiyesi sıfırlandı." : "Demo balance reset."),
      variant: error ? "destructive" : "default",
    });
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
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">{tr.settings}</h1>

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

        <Card className="p-6 glass border-border/40 space-y-3">
          <h2 className="font-semibold">{tr.reset_demo}</h2>
          <p className="text-sm text-muted-foreground">{tr.reset_demo_desc}</p>
          <Button variant="outline" onClick={resetDemo} disabled={resetting}>
            <RotateCcw className="size-4" /> {tr.reset_demo}
          </Button>
        </Card>
      </div>
    </AppShell>
  );
}

export default function Settings() { return <ProtectedRoute><SettingsInner /></ProtectedRoute>; }
