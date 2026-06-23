import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, ShieldAlert, Plus, Pencil, Settings } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";

const CRYPTO_SYMBOLS = ["BTCUSD", "ETHUSD", "SOLUSD", "BNBUSD", "XRPUSD", "DOGEUSD", "ADAUSD", "AVAXUSD", "DOTUSD", "LINKUSD", "MATICUSD", "UNIUSD", "ATOMUSD", "TRXUSD", "LTCUSD", "FILUSD", "BCHUSD", "ETCUSD", "XLMUSD", "ICPUSD", "NEARUSD", "APTUSD", "ARBUSD", "OPUSD", "SUIUSD", "SEIUSD", "PYTHUSD", "RENDERUSD", "TONUSD", "BONKUSD", "PEPEUSD"];

interface SlippageConfig {
  symbol: string;
  max_slippage_pct: number;
  mode: "fixed" | "dynamic";
  updated_at: string;
}

export default function AdminSettings() {
  const { user, loading: authLoading } = useApp();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [configs, setConfigs] = useState<SlippageConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null);
  const [formSymbol, setFormSymbol] = useState("");
  const [formPct, setFormPct] = useState<number>(0.5);
  const [formMode, setFormMode] = useState<"fixed" | "dynamic">("fixed");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/auth"); return; }
    supabase.rpc("has_role", { _user_id: user.id, _role: "admin" })
      .then(({ data }) => setIsAdmin(data === true));
  }, [user, authLoading, navigate]);

  async function fetchConfigs() {
    if (isAdmin !== true) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("admin-slippage-config", { method: "GET" });
    if (error) {
      toast.error("Config'ler yüklenemedi");
      setLoading(false);
      return;
    }
    setConfigs(data?.configs ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchConfigs(); }, [isAdmin]);

  const configuredSymbols = new Set(configs.map((c) => c.symbol));
  const missingSymbols = CRYPTO_SYMBOLS.filter((s) => !configuredSymbols.has(s));

  function openAddDialog() {
    setEditingSymbol(null);
    setFormSymbol("");
    setFormPct(0.5);
    setFormMode("fixed");
    setDialogOpen(true);
  }

  function openEditDialog(cfg: SlippageConfig) {
    setEditingSymbol(cfg.symbol);
    setFormSymbol(cfg.symbol);
    setFormPct(cfg.max_slippage_pct);
    setFormMode(cfg.mode);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!formSymbol.trim()) { toast.error("Sembol boş olamaz"); return; }
    if (formPct < 0.01 || formPct > 100) { toast.error("Slippage 0.01-100 arası olmalı"); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-slippage-config", {
        method: "POST",
        body: { symbol: formSymbol.trim().toUpperCase(), max_slippage_pct: formPct, mode: formMode },
      });
      if (error) { toast.error("Kaydetme başarısız"); return; }
      toast.success(`${formSymbol.trim().toUpperCase()} kaydedildi`);
      setDialogOpen(false);
      await fetchConfigs();
    } finally {
      setSaving(false);
    }
  }

  async function createDefaults() {
    setSaving(true);
    try {
      for (const sym of missingSymbols) {
        await supabase.functions.invoke("admin-slippage-config", {
          method: "POST",
          body: { symbol: sym, max_slippage_pct: 0.5, mode: "fixed" },
        });
      }
      toast.success(`${missingSymbols.length} sembol için default oluşturuldu`);
      await fetchConfigs();
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || isAdmin === null) {
    return <AppShell><div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div></AppShell>;
  }

  if (isAdmin === false) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto p-6 text-center space-y-3">
          <ShieldAlert className="size-12 mx-auto text-destructive" />
          <h1 className="text-xl font-bold">Erişim Yok</h1>
          <p className="text-sm text-muted-foreground">Bu sayfa yalnızca yöneticiler içindir.</p>
          <Button variant="outline" onClick={() => navigate("/")}>Ana sayfaya dön</Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Sistem Ayarları</h1>
            <p className="text-sm text-muted-foreground">Slippage Konfigürasyonu</p>
          </div>
          <Button onClick={openAddDialog} className="gap-2">
            <Plus className="size-4" /> Yeni Ekle
          </Button>
        </header>

        <Card className="p-4 glass">
          {missingSymbols.length > 0 && configs.length > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-muted/50 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Henüz konfigürasyon yok: {missingSymbols.join(", ")}
              </p>
              <Button size="sm" variant="outline" onClick={createDefaults} disabled={saving}>
                {saving ? <Loader2 className="size-3 animate-spin" /> : "Tüm semboller için default oluştur"}
              </Button>
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sembol</TableHead>
                  <TableHead>Max Slippage (%)</TableHead>
                  <TableHead>Mod</TableHead>
                  <TableHead>Güncelleme</TableHead>
                  <TableHead className="text-right">Aksiyonlar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      <Loader2 className="size-4 animate-spin inline" />
                    </TableCell>
                  </TableRow>
                ) : configs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8 space-y-3">
                      <Settings className="size-8 mx-auto opacity-40" />
                      <p>Henüz konfigürasyon yok</p>
                      <Button size="sm" onClick={createDefaults} disabled={saving}>
                        {saving ? <Loader2 className="size-3 animate-spin" /> : "Tüm semboller için default oluştur"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  configs.map((cfg) => (
                    <TableRow key={cfg.symbol}>
                      <TableCell className="font-mono font-bold">{cfg.symbol}</TableCell>
                      <TableCell className="tabular-nums">{cfg.max_slippage_pct}%</TableCell>
                      <TableCell>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {cfg.mode === "fixed" ? "Sabit" : "Dinamik"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(cfg.updated_at).toLocaleString("tr-TR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => openEditDialog(cfg)} className="gap-1">
                          <Pencil className="size-3" /> Düzenle
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSymbol ? "Slippage Düzenle" : "Yeni Slippage Ekle"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">Sembol</Label>
              {editingSymbol ? (
                <Input value={editingSymbol} disabled className="font-mono opacity-60" />
              ) : (
                <Input
                  value={formSymbol}
                  onChange={(e) => setFormSymbol(e.target.value.toUpperCase())}
                  placeholder="BTCUSD, ETHUSD vb."
                  className="font-mono"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Max Slippage (%)</Label>
              <Input
                type="number"
                value={formPct}
                onChange={(e) => setFormPct(Number(e.target.value))}
                step="0.1"
                min="0.01"
                max="100"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Mod</Label>
              <Select value={formMode} onValueChange={(v) => setFormMode(v as "fixed" | "dynamic")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Sabit (Fixed)</SelectItem>
                  <SelectItem value="dynamic">Dinamik (Dynamic)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>İptal</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
