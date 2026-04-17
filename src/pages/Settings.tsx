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
import { toast } from "@/hooks/use-toast";
import { Moon, Sun, RotateCcw } from "lucide-react";

function SettingsInner() {
  const { user, lang, setLang, theme, setTheme } = useApp();
  const tr = t(lang);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [alpacaKey, setAlpacaKey] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("display_name").eq("id", user.id).single()
      .then(({ data }) => { if (data) setDisplayName(data.display_name || ""); });
  }, [user]);

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ display_name: displayName, preferred_language: lang, preferred_theme: theme }).eq("id", user.id);
    setSaving(false);
    toast({ title: error ? tr.error : tr.success, description: error?.message, variant: error ? "destructive" : "default" });
  };

  const resetDemo = async () => {
    if (!user) return;
    setResetting(true);
    await supabase.from("positions").delete().eq("user_id", user.id);
    await supabase.from("profiles").update({ demo_balance: 100000, initial_balance: 100000 }).eq("id", user.id);
    setResetting(false);
    toast({ title: tr.success, description: lang === "tr" ? "Demo bakiyesi sıfırlandı." : "Demo balance reset." });
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
          <h2 className="font-semibold">{tr.theme} & {tr.language}</h2>
          <div className="flex gap-3">
            <Button variant={theme === "dark" ? "default" : "outline"} onClick={() => setTheme("dark")} className="flex-1">
              <Moon className="size-4" /> {tr.dark}
            </Button>
            <Button variant={theme === "light" ? "default" : "outline"} onClick={() => setTheme("light")} className="flex-1">
              <Sun className="size-4" /> {tr.light}
            </Button>
          </div>
          <div className="flex gap-3">
            <Button variant={lang === "tr" ? "default" : "outline"} onClick={() => setLang("tr")} className="flex-1">Türkçe</Button>
            <Button variant={lang === "en" ? "default" : "outline"} onClick={() => setLang("en")} className="flex-1">English</Button>
          </div>
        </Card>

        <Card className="p-6 glass border-border/40 space-y-3">
          <h2 className="font-semibold">{tr.reset_demo}</h2>
          <p className="text-sm text-muted-foreground">{tr.reset_demo_desc}</p>
          <Button variant="outline" onClick={resetDemo} disabled={resetting}>
            <RotateCcw className="size-4" /> {tr.reset_demo}
          </Button>
        </Card>

        <Card className="p-6 glass border-border/40 space-y-3">
          <h2 className="font-semibold">{tr.broker}</h2>
          <p className="text-sm text-muted-foreground">{tr.broker_desc}</p>
          <div className="space-y-2">
            <Label>Alpaca API Key</Label>
            <Input value={alpacaKey} onChange={(e) => setAlpacaKey(e.target.value)} placeholder="(disabled in demo)" disabled />
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

export default function Settings() { return <ProtectedRoute><SettingsInner /></ProtectedRoute>; }
