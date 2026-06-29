// Admin Audit Log page
import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { Search, RefreshCw, ChevronLeft, ChevronRight, ClipboardList, Loader2 } from "lucide-react";

interface AuditEntry {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, { tr: string; en: string }> = {
  "2fa_enabled": { tr: "2FA Açıldı", en: "2FA Enabled" },
  "2fa_disabled": { tr: "2FA Kapatıldı", en: "2FA Disabled" },
  "trade_executed": { tr: "İşlem Yapıldı", en: "Trade Executed" },
  "position_closed": { tr: "Pozisyon Kapatıldı", en: "Position Closed" },
  "balance_adjusted": { tr: "Bakiye Düzenlendi", en: "Balance Adjusted" },
  "role_changed": { tr: "Rol Değişti", en: "Role Changed" },
  "user_banned": { tr: "Kullanıcı Yasaklandı", en: "User Banned" },
  "user_unbanned": { tr: "Kullanıcı Yasağı Kaldırıldı", en: "User Unbanned" },
  "password_changed": { tr: "Şifre Değişti", en: "Password Changed" },
  "email_changed": { tr: "E-posta Değişti", en: "Email Changed" },
};

function AuditLogInner() {
  const { lang } = useApp();
  const isEn = lang === "en";
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("audit_logs").select("*", { count: "exact" });
    if (search) query = query.ilike("user_id::text", `%${search}%`);
    if (actionFilter) query = query.eq("action", actionFilter);
    query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    const { data, count, error } = await query;
    if (error) {
      console.error(error);
    } else {
      setEntries((data ?? []) as AuditEntry[]);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [search, actionFilter, offset]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalPages = Math.ceil(total / limit);
  const page = Math.floor(offset / limit) + 1;

  return (
    <AppShell>
      <main role="main" aria-label="Audit Log" className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="size-5" />
            {isEn ? "Audit Log" : "Denetim Kaydı"}
          </h1>
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`size-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            {isEn ? "Refresh" : "Yenile"}
          </Button>
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
              placeholder={isEn ? "Search by user ID..." : "Kullanıcı ID ile ara..."}
              className="pl-9"
            />
          </div>
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setOffset(0); }}
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">{isEn ? "All actions" : "Tüm işlemler"}</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{isEn ? v.en : v.tr}</option>
            ))}
          </select>
        </div>

        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {isEn ? "No audit entries found" : "Denetim kaydı bulunamadı"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{isEn ? "Time" : "Zaman"}</TableHead>
                  <TableHead className="text-xs">{isEn ? "Action" : "İşlem"}</TableHead>
                  <TableHead className="text-xs">User ID</TableHead>
                  <TableHead className="text-xs">{isEn ? "Entity" : "Varlık"}</TableHead>
                  <TableHead className="text-xs">IP</TableHead>
                  <TableHead className="text-xs">{isEn ? "Details" : "Detay"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(e.created_at).toLocaleString(isEn ? "en-US" : "tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {ACTION_LABELS[e.action]?.[isEn ? "en" : "tr"] ?? e.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[10px] font-mono max-w-[80px] truncate">{e.user_id?.slice(0, 8) ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {e.entity_type ? `${e.entity_type}${e.entity_id ? `:${e.entity_id.toString().slice(0, 8)}` : ""}` : "—"}
                    </TableCell>
                    <TableCell className="text-[10px] font-mono">{e.ip_address ?? "—"}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate text-muted-foreground">
                      {e.metadata && Object.keys(e.metadata).length > 0 ? JSON.stringify(e.metadata).slice(0, 60) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{isEn ? `Page ${page} of ${totalPages}` : `Sayfa ${page} / ${totalPages}`} ({total} {isEn ? "entries" : "kayıt"})</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={offset <= 0} onClick={() => setOffset((p) => Math.max(0, p - limit))}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={offset + limit >= total} onClick={() => setOffset((p) => p + limit)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}

export default function AuditLog() {
  return <ProtectedRoute requiredRole="admin"><AuditLogInner /></ProtectedRoute>;
}
