import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Search, MoreHorizontal, Shield, ShieldOff, Ban, Wallet, ChevronLeft, ChevronRight, Users } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { callEdgeFunction } from "@/lib/edge-error";
import type {
  AdminUser,
  AdminListUsersResponse,
  AdminSetUserRoleResponse,
  AdminBanUserResponse,
} from "@/lib/edge-function-types";

const PAGE_SIZE = 50;

export default function AdminUsers() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const search = searchParams.get("search") ?? "";
  const roleFilter = searchParams.get("role") ?? "all";
  const banFilter = searchParams.get("ban") ?? "all";
  const offset = Number(searchParams.get("offset") ?? "0");

  const [searchInput, setSearchInput] = useState(search);
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput.length === 0 || searchInput.length >= 3) {
        setDebouncedSearch(searchInput);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reset offset when filters change
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("offset", "0");
      return next;
    }, { replace: true });
  }, [debouncedSearch, roleFilter, banFilter]);

  // Fetch users
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    callEdgeFunction<AdminListUsersResponse>("admin-list-users", {
      search: debouncedSearch || undefined,
      role: roleFilter === "all" ? undefined : roleFilter,
      status: banFilter === "all" ? undefined : banFilter === "banned" ? "banned" : "active",
      limit: PAGE_SIZE,
      offset,
    })
      .then((data) => {
        if (!cancelled) {
          setUsers(data.users);
          setTotal(data.total);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUsers([]);
          setTotal(0);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [debouncedSearch, roleFilter, banFilter, offset]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  function updateParam(key: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === "all" || value === "") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      return next;
    }, { replace: true });
  }

  // ─── Role Change Dialog ───
  const [roleDialogUser, setRoleDialogUser] = useState<AdminUser | null>(null);
  const [roleSubmitting, setRoleSubmitting] = useState(false);

  async function handleRoleChange() {
    if (!roleDialogUser) return;
    setRoleSubmitting(true);
    const newRole = roleDialogUser.role === "admin" ? "user" : "admin";
    try {
      await callEdgeFunction<AdminSetUserRoleResponse>("admin-set-user-role", {
        user_id: roleDialogUser.id,
        role: newRole,
      });
      toast.success(`${roleDialogUser.display_name ?? roleDialogUser.username ?? roleDialogUser.id.slice(0, 8)} rolü ${newRole} olarak değiştirildi`);
      setRoleDialogUser(null);
      refresh();
    } finally {
      setRoleSubmitting(false);
    }
  }

  // ─── Ban Dialog ───
  const [banDialogUser, setBanDialogUser] = useState<AdminUser | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banSubmitting, setBanSubmitting] = useState(false);

  async function handleBan() {
    if (!banDialogUser || banReason.length < 5) return;
    setBanSubmitting(true);
    const isBanned = banDialogUser.is_active !== false;
    try {
      await callEdgeFunction<AdminBanUserResponse>("admin-ban-user", {
        user_id: banDialogUser.id,
        banned: isBanned,
        reason: banReason,
      });
      toast.success(isBanned
        ? `${banDialogUser.display_name ?? banDialogUser.username ?? banDialogUser.id.slice(0, 8)} banlandı`
        : `${banDialogUser.display_name ?? banDialogUser.username ?? banDialogUser.id.slice(0, 8)} banı kaldırıldı`);
      setBanDialogUser(null);
      setBanReason("");
      refresh();
    } finally {
      setBanSubmitting(false);
    }
  }

  function refresh() {
    setDebouncedSearch((s) => s + " ");
    setTimeout(() => setDebouncedSearch((s) => s.trim()), 10);
  }

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
        <header>
          <h1 className="text-2xl md:text-3xl font-bold">Kullanıcı Yönetimi</h1>
          <p className="text-sm text-muted-foreground">Tüm kayıtlı kullanıcıları görüntüle ve yönet</p>
        </header>

        {/* Filters */}
        <Card className="p-4 glass space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_140px] gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Arama (min 3 karakter)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="İsim veya kullanıcı adı ara..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Rol</Label>
              <Select value={roleFilter} onValueChange={(v) => updateParam("role", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="user">Kullanıcı</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Durum</Label>
              <Select value={banFilter} onValueChange={(v) => updateParam("ban", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="banned">Banlı</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* Table */}
        <Card className="glass overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kullanıcı</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead className="text-right">Gerçek Bakiye</TableHead>
                  <TableHead className="text-right">Demo Bakiye</TableHead>
                  <TableHead>Kayıt Tarihi</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="text-right">Aksiyon</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-14" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                      <Users className="size-8 mx-auto mb-2 opacity-40" />
                      Kullanıcı bulunamadı
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium truncate max-w-[180px]">{u.display_name ?? "—"}</span>
                          <span className="text-xs text-muted-foreground truncate max-w-[180px]">@{u.username ?? u.id.slice(0, 8)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                          {u.role ?? "user"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        ${Number(u.real_balance).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        ${Number(u.demo_balance).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString("tr-TR")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.is_active !== false ? "secondary" : "destructive"}>
                          {u.is_active !== false ? "Aktif" : "Banlı"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setRoleDialogUser(u)}>
                              {u.role === "admin" ? <ShieldOff className="size-4 mr-2" /> : <Shield className="size-4 mr-2" />}
                              {u.role === "admin" ? "Admin'i Kaldır" : "Admin Yap"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setBanDialogUser(u)}>
                              <Ban className="size-4 mr-2" />
                              {u.is_active !== false ? "Banla" : "Banı Kaldır"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => navigate(`/admin/blitz?user_id=${u.id}`)}>
                              <Wallet className="size-4 mr-2" />
                              Bakiye Yükle
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-xs text-muted-foreground">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} / {total}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canPrev}
                  onClick={() => updateParam("offset", String(offset - PAGE_SIZE))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canNext}
                  onClick={() => updateParam("offset", String(offset + PAGE_SIZE))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ─── Role Change Dialog ─── */}
      <Dialog open={!!roleDialogUser} onOpenChange={(open) => { if (!open) setRoleDialogUser(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rol Değiştir</DialogTitle>
            <DialogDescription>
              {roleDialogUser && (
                <>
                  <strong>{roleDialogUser.display_name ?? roleDialogUser.username ?? roleDialogUser.id.slice(0, 8)}</strong>{" "}
                  kullanıcısının rolü{" "}
                  <strong>{roleDialogUser.role ?? "user"}</strong> →{" "}
                  <strong>{roleDialogUser.role === "admin" ? "user" : "admin"}</strong> olarak değiştirilsin mi?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogUser(null)} disabled={roleSubmitting}>İptal</Button>
            <Button onClick={handleRoleChange} disabled={roleSubmitting}>
              {roleSubmitting && <Loader2 className="size-4 animate-spin mr-2" />}
              Onayla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Ban Dialog ─── */}
      <Dialog
        open={!!banDialogUser}
        onOpenChange={(open) => { if (!open) { setBanDialogUser(null); setBanReason(""); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {banDialogUser?.is_active !== false ? "Kullanıcıyı Banla" : "Banı Kaldır"}
            </DialogTitle>
            <DialogDescription>
              {banDialogUser && (
                <>
                  <strong>{banDialogUser.display_name ?? banDialogUser.username ?? banDialogUser.id.slice(0, 8)}</strong>{" "}
                  {banDialogUser.is_active !== false ? "banlanacak" : "banı kaldırılacak"}.
                  {banDialogUser.is_active !== false && " Bu kullanıcı artık siteye erişemez."}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {banDialogUser?.is_active !== false && (
            <div className="space-y-2">
              <Label className="text-xs">Ban Sebebi (min 5 karakter)</Label>
              <Input
                placeholder="Şüpheli aktivite, hile vb."
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                autoFocus
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBanDialogUser(null); setBanReason(""); }} disabled={banSubmitting}>İptal</Button>
            <Button
              variant="destructive"
              onClick={handleBan}
              disabled={banSubmitting || (banDialogUser?.is_active !== false && banReason.length < 5)}
            >
              {banSubmitting && <Loader2 className="size-4 animate-spin mr-2" />}
              {banDialogUser?.is_active !== false ? "Banla" : "Banı Kaldır"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
