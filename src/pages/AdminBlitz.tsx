import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Wallet, TrendingUp, ShieldAlert, Search, Check, CalendarDays, RefreshCw } from "lucide-react";
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format, subDays, startOfDay, endOfDay, parseISO } from "date-fns";
import { tr } from "date-fns/locale";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { callEdgeFunction } from "@/lib/edge-error";
import type { Database, Json } from "@/integrations/supabase/types";
import { useApp } from "@/contexts/AppContext";

interface DailyRow { day: string; source: string; tx_count: number; total_amount: number; }
interface RevenueRow { id: string; created_at: string; amount: number; source: string; metadata: Json; room_id: string | null; }
interface BreakdownRow { key: string; total: number; }
interface UserSearchResult { id: string; display_name: string | null; username: string | null; }
interface TopupHistoryRow { id: string; user_id: string; amount: number; reason: string | null; created_at: string; target_name: string | null; }

const REASON_CATEGORIES = [
  { value: "karsilama-bonusu", label: "Karşılama Bonusu" },
  { value: "manuel-iade", label: "Manuel İade" },
  { value: "promosyon", label: "Promosyon" },
  { value: "yarisma-odulu", label: "Yarışma Ödülü" },
  { value: "diger", label: "Diğer" },
];

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--bull))",
  "hsl(var(--bear))",
  "hsl(var(--primary-glow))",
  "hsl(var(--muted-foreground))",
  "#f59e0b",
  "#8b5cf6",
  "#06b6d4",
];

const PAGE_SIZE = 50;

export default function AdminBlitz() {
  const { user, loading: authLoading } = useApp();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // Date range state
  const [datePreset, setDatePreset] = useState("30");
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Revenue data
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [filteredRevenue, setFilteredRevenue] = useState<RevenueRow[]>([]);
  const [symbolData, setSymbolData] = useState<BreakdownRow[]>([]);
  const [sourceData, setSourceData] = useState<BreakdownRow[]>([]);
  const [detailPage, setDetailPage] = useState(0);

  // Top-up form
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [amount, setAmount] = useState<number>(100);
  const [reasonCategory, setReasonCategory] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Top-up history
  const [topupHistory, setTopupHistory] = useState<TopupHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/auth"); return; }
    supabase.rpc("has_role", { _user_id: user.id, _role: "admin" })
      .then(({ data }) => setIsAdmin(data === true));
  }, [user, authLoading, navigate]);

  // Revenue fetch — date range dependent
  useEffect(() => {
    if (isAdmin !== true) return;
    const fromIso = dateRange.from.toISOString();
    const toIso = dateRange.to.toISOString();
    setRefreshing(true);

    Promise.all([
      supabase.from("platform_revenue")
        .select("*")
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false }),
      supabase.from("platform_revenue")
        .select("amount, room_id, blitz_rooms!inner(symbol)")
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      supabase.from("platform_revenue_daily" as keyof Database["public"]["Tables"])
        .select("*")
        .gte("day", format(dateRange.from, "yyyy-MM-dd"))
        .lte("day", format(dateRange.to, "yyyy-MM-dd")),
    ]).then(([revRes, symRes, dailyRes]) => {
      const revenues = (revRes.data as RevenueRow[]) ?? [];
      setFilteredRevenue(revenues);

      const symMap = new Map<string, number>();
      (symRes.data as any[])?.forEach((r) => {
        const sym = r.blitz_rooms?.symbol ?? "Bilinmeyen";
        symMap.set(sym, (symMap.get(sym) ?? 0) + Number(r.amount));
      });
      setSymbolData(
        Array.from(symMap.entries())
          .map(([key, total]) => ({ key, total }))
          .sort((a, b) => b.total - a.total)
      );

      const srcMap = new Map<string, number>();
      revenues.forEach((r) => {
        srcMap.set(r.source, (srcMap.get(r.source) ?? 0) + Number(r.amount));
      });
      setSourceData(
        Array.from(srcMap.entries())
          .map(([key, total]) => ({ key, total }))
          .sort((a, b) => b.total - a.total)
      );

      setDaily((dailyRes.data as unknown as DailyRow[]) ?? []);
      setLoading(false);
      setRefreshing(false);
      setDetailPage(0);
    });
  }, [isAdmin, dateRange]);

  // Fetch top-up history
  useEffect(() => {
    if (isAdmin !== true) return;
    setHistoryLoading(true);
    supabase
      .from("real_balance_ledger")
      .select("id, user_id, amount, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(10)
      .then(async ({ data }) => {
        if (!data || data.length === 0) { setTopupHistory([]); setHistoryLoading(false); return; }
        const userIds = [...new Set(data.map(r => r.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", userIds);
        const profileMap = new Map((profiles ?? []).map(p => [p.id, p.display_name]));
        setTopupHistory(data.map(r => ({
          ...r,
          target_name: profileMap.get(r.user_id) ?? null,
        })));
        setHistoryLoading(false);
      });
  }, [isAdmin]);

  // Date range handlers
  function handlePresetChange(preset: string) {
    setDatePreset(preset);
    if (preset === "custom") return;
    const days = preset === "7" ? 7 : preset === "90" ? 90 : 30;
    setDateRange({ from: subDays(new Date(), days), to: new Date() });
  }

  function handleCustomDateApply() {
    if (customFrom && customTo) {
      setDateRange({ from: startOfDay(customFrom), to: endOfDay(customTo) });
      setCalendarOpen(false);
    }
  }

  // KPI calculations
  const kpis = useMemo(() => {
    const totalRevenue = filteredRevenue.reduce((s, r) => s + Number(r.amount), 0);
    const uniqueRooms = new Set(filteredRevenue.map(r => r.room_id).filter(Boolean)).size;
    const avgFeePerRoom = uniqueRooms > 0 ? totalRevenue / uniqueRooms : 0;
    const maxFee = filteredRevenue.length > 0 ? Math.max(...filteredRevenue.map(r => Number(r.amount))) : 0;
    return { totalRevenue, uniqueRooms, avgFeePerRoom, maxFee };
  }, [filteredRevenue]);

  // Line chart data
  const lineChartData = useMemo(() =>
    [...daily].reverse().map((d) => ({
      day: format(parseISO(d.day), "dd MMM", { locale: tr }),
      gelir: Number(d.total_amount),
    })),
    [daily]
  );

  // Detail table pagination
  const pagedRevenue = useMemo(() => {
    const start = detailPage * PAGE_SIZE;
    return filteredRevenue.slice(start, start + PAGE_SIZE);
  }, [filteredRevenue, detailPage]);
  const totalPages = Math.ceil(filteredRevenue.length / PAGE_SIZE);

  // User search with debounce
  function onSearchChange(value: string) {
    setSearchQuery(value);
    setSelectedUser(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 3) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `${supabase.functions.url}/admin-list-users?search=${encodeURIComponent(value.trim())}&limit=10`;
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json();
        setSearchResults(json.users ?? []);
        setShowDropdown(true);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  function selectUser(u: UserSearchResult) {
    setSelectedUser(u);
    setSearchQuery(u.display_name || u.username || u.id);
    setShowDropdown(false);
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const finalReason = reasonCategory === "diger" ? customReason.trim() : REASON_CATEGORIES.find(r => r.value === reasonCategory)?.label ?? "";
  const canSubmit = !!selectedUser && amount > 0 && !!finalReason;

  function handleApplyClick() {
    if (!canSubmit) {
      if (!selectedUser) toast.error("Kullanıcı seçin");
      else if (!finalReason) toast.error("Açıklama kategorisi zorunlu");
      return;
    }
    setConfirmOpen(true);
  }

  async function confirmTopup() {
    setConfirmOpen(false);
    setSubmitting(true);
    try {
      const data = await callEdgeFunction<{ new_balance: number; error?: string }>("blitz-admin-topup", {
        user_id: selectedUser!.id,
        amount: Number(amount),
        reason: finalReason,
      });
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      toast.success(`Yeni bakiye: $${data.new_balance}`);
      setSearchQuery(""); setSelectedUser(null); setAmount(100); setReasonCategory(""); setCustomReason("");
      // Refresh history
      if (isAdmin === true) {
        const { data: freshData } = await supabase
          .from("real_balance_ledger")
          .select("id, user_id, amount, reason, created_at")
          .order("created_at", { ascending: false })
          .limit(10);
        if (freshData) {
          const userIds = [...new Set(freshData.map(r => r.user_id))];
          const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", userIds);
          const profileMap = new Map((profiles ?? []).map(p => [p.id, p.display_name]));
          setTopupHistory(freshData.map(r => ({ ...r, target_name: profileMap.get(r.user_id) ?? null })));
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  const getSymbol = (r: RevenueRow) => {
    const meta = r.metadata as Record<string, any> | null;
    return meta?.symbol ?? "—";
  };

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
          <Button variant="outline" onClick={() => navigate("/blitz")}>Blitz'e dön</Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Blitz Admin</h1>
            <p className="text-sm text-muted-foreground">Komisyon raporu + manuel bakiye yönetimi</p>
          </div>
        </header>

        {/* Date Range Selector */}
        <Card className="p-4 glass">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Tarih Aralığı</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={datePreset} onValueChange={handlePresetChange}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Son 7 gün</SelectItem>
                  <SelectItem value="30">Son 30 gün</SelectItem>
                  <SelectItem value="90">Son 90 gün</SelectItem>
                  <SelectItem value="custom">Özel aralık</SelectItem>
                </SelectContent>
              </Select>

              {datePreset === "custom" && (
                <div className="flex items-center gap-2">
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        {customFrom ? format(customFrom, "dd MMM yyyy", { locale: tr }) : "Başlangıç"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} />
                    </PopoverContent>
                  </Popover>
                  <span className="text-muted-foreground">—</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        {customTo ? format(customTo, "dd MMM yyyy", { locale: tr }) : "Bitiş"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={customTo} onSelect={setCustomTo} />
                    </PopoverContent>
                  </Popover>
                  <Button size="sm" onClick={handleCustomDateApply} disabled={!customFrom || !customTo}>
                    Uygula
                  </Button>
                </div>
              )}

              <Button variant="ghost" size="icon" onClick={() => handlePresetChange(datePreset)} disabled={refreshing}>
                <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
              </Button>
            </div>
            <div className="text-xs text-muted-foreground ml-auto">
              {format(dateRange.from, "dd MMM yyyy", { locale: tr })} — {format(dateRange.to, "dd MMM yyyy", { locale: tr })}
            </div>
          </div>
        </Card>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4 glass">
            <div className="text-xs text-muted-foreground">Toplam Revenue</div>
            <div className="text-2xl font-bold tabular-nums">${kpis.totalRevenue.toFixed(2)}</div>
          </Card>
          <Card className="p-4 glass">
            <div className="text-xs text-muted-foreground">Toplam Oda</div>
            <div className="text-2xl font-bold tabular-nums">{kpis.uniqueRooms}</div>
          </Card>
          <Card className="p-4 glass">
            <div className="text-xs text-muted-foreground">Ort. Fee/Oda</div>
            <div className="text-2xl font-bold tabular-nums">${kpis.avgFeePerRoom.toFixed(2)}</div>
          </Card>
          <Card className="p-4 glass">
            <div className="text-xs text-muted-foreground">En Yüksek Fee</div>
            <div className="text-2xl font-bold tabular-nums">${kpis.maxFee.toFixed(2)}</div>
          </Card>
        </div>

        {/* Line Chart */}
        <Card className="p-4 glass">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">Günlük Gelir Trendi</h2>
          </div>
          <div className="h-64">
            {lineChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Line type="monotone" dataKey="gelir" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Henüz veri yok</div>
            )}
          </div>
        </Card>

        {/* Pie Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4 glass">
            <h2 className="text-sm font-semibold mb-3">Sembol Bazlı Gelir</h2>
            <div className="h-56">
              {symbolData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={symbolData}
                      dataKey="total"
                      nameKey="key"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ key, percent }) => `${key} ${(percent * 100).toFixed(0)}%`}
                    >
                      {symbolData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Veri yok</div>
              )}
            </div>
          </Card>

          <Card className="p-4 glass">
            <h2 className="text-sm font-semibold mb-3">Kaynak Bazlı Gelir</h2>
            <div className="h-56">
              {sourceData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sourceData}
                      dataKey="total"
                      nameKey="key"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ key, percent }) => `${key} ${(percent * 100).toFixed(0)}%`}
                    >
                      {sourceData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Veri yok</div>
              )}
            </div>
          </Card>
        </div>

        {/* Top-up Form */}
        <Card className="p-4 glass space-y-3">
          <div className="flex items-center gap-2">
            <Wallet className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">Manuel Bakiye Kredisi</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_1fr_auto] gap-2">
            {/* Kullanıcı autocomplete */}
            <div className="space-y-1 relative" ref={dropdownRef}>
              <Label className="text-xs">Kullanıcı</Label>
              <div className="relative">
                <Input
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                  placeholder="Ad veya kullanıcı adı yazın..."
                  disabled={submitting}
                  className="pr-8"
                />
                <Search className="absolute right-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              </div>
              {showDropdown && searchResults.length > 0 && (
                <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-md max-h-60 overflow-auto">
                  {searchResults.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectUser(u)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{u.display_name || "İsimsiz"}</div>
                        <div className="text-xs text-muted-foreground truncate">@{u.username || "—"}</div>
                      </div>
                      {selectedUser?.id === u.id && <Check className="size-4 shrink-0 text-primary" />}
                    </button>
                  ))}
                </div>
              )}
              {showDropdown && searchResults.length === 0 && !searching && searchQuery.length >= 3 && (
                <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-md px-3 py-2 text-sm text-muted-foreground">
                  Sonuç bulunamadı
                </div>
              )}
              {searching && (
                <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-md px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="size-3 animate-spin" /> Aranıyor...
                </div>
              )}
            </div>

            {/* Miktar */}
            <div className="space-y-1">
              <Label className="text-xs">Miktar ($)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} step="0.01" min="0.01" disabled={submitting} />
            </div>

            {/* Açıklama kategorisi */}
            <div className="space-y-1">
              <Label className="text-xs">Açıklama</Label>
              <Select value={reasonCategory} onValueChange={setReasonCategory} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Kategori seçin..." />
                </SelectTrigger>
                <SelectContent>
                  {REASON_CATEGORIES.map((rc) => (
                    <SelectItem key={rc.value} value={rc.value}>{rc.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {reasonCategory === "diger" && (
                <Input
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Açıklama yazın..."
                  className="mt-1"
                  disabled={submitting}
                />
              )}
            </div>

            {/* Uygula butonu */}
            <div className="space-y-1">
              <Label className="text-xs opacity-0">.</Label>
              <Button onClick={handleApplyClick} disabled={submitting || !canSubmit}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : "Uygula"}
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Negatif tutar girersen bakiye düşülür. Kilitli fonun altına inilemez.
          </p>
        </Card>

        {/* Onay Dialog */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Top-up Onayı</AlertDialogTitle>
              <AlertDialogDescription>
                <span className="block">Kullanıcı: <strong>{selectedUser?.display_name}</strong> ({selectedUser?.id})</span>
                <span className="block">Miktar: <strong>${Number(amount).toFixed(2)}</strong></span>
                <span className="block">Açıklama: <strong>{finalReason}</strong></span>
                <span className="block mt-2">Bu işlemi onaylıyor musunuz?</span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>İptal</AlertDialogCancel>
              <AlertDialogAction onClick={confirmTopup}>Onayla</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Son Top-up İşlemleri */}
        <Card className="p-4 glass">
          <h2 className="text-sm font-semibold mb-3">Son Top-up İşlemleri</h2>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Kullanıcı</TableHead>
                  <TableHead className="text-right">Miktar</TableHead>
                  <TableHead>Açıklama</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground"><Loader2 className="size-4 animate-spin inline" /></TableCell></TableRow>
                ) : topupHistory.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Henüz top-up işlemi yok</TableCell></TableRow>
                ) : topupHistory.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{new Date(r.created_at).toLocaleString("tr-TR")}</TableCell>
                    <TableCell className="text-sm">{r.target_name ?? r.user_id.slice(0, 8)}</TableCell>
                    <TableCell className={`text-right font-bold tabular-nums ${r.amount >= 0 ? "text-green-500" : "text-red-500"}`}>
                      {r.amount >= 0 ? "+" : ""}${Number(r.amount).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-xs">{r.reason ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Detail Table — Revenue with Pagination */}
        <Card className="p-4 glass">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Detay Tablosu ({filteredRevenue.length} kayıt)</h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Sayfa {totalPages > 0 ? detailPage + 1 : 0} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={detailPage === 0} onClick={() => setDetailPage(p => p - 1)}>
                Geri
              </Button>
              <Button variant="outline" size="sm" disabled={detailPage >= totalPages - 1} onClick={() => setDetailPage(p => p + 1)}>
                İleri
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Sembol</TableHead>
                  <TableHead>Kaynak</TableHead>
                  <TableHead className="text-right">Miktar</TableHead>
                  <TableHead>Oda ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground"><Loader2 className="size-4 animate-spin inline" /></TableCell></TableRow>
                ) : pagedRevenue.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Henüz komisyon kaydı yok</TableCell></TableRow>
                ) : pagedRevenue.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{new Date(r.created_at).toLocaleString("tr-TR")}</TableCell>
                    <TableCell className="text-xs font-mono">{getSymbol(r)}</TableCell>
                    <TableCell><span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{r.source}</span></TableCell>
                    <TableCell className="text-right font-bold tabular-nums">${Number(r.amount).toFixed(4)}</TableCell>
                    <TableCell className="text-xs font-mono">{r.room_id?.slice(0, 8) ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
