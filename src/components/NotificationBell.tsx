// Bildirim merkezi - zil ikonu, okunmamış sayısı badge, popover liste, realtime
import { useEffect, useState } from "react";
import { Bell, Check, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

export default function NotificationBell() {
  const { user, lang } = useApp();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [shake, setShake] = useState(false);

  const unread = items.filter((i) => !i.read).length;

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data ?? []) as Notif[]);
  };

  useEffect(() => { load(); }, [user]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notifications_${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          const n = payload.new as Notif;
          setItems((prev) => [n, ...prev].slice(0, 30));
          setShake(true);
          setTimeout(() => setShake(false), 800);
          toast({ title: n.title, description: n.body ?? undefined });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const markAllRead = async () => {
    if (!user || unread === 0) return;
    await supabase.from("notifications").update({ read: true })
      .eq("user_id", user.id).eq("read", false);
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
  };

  const handleClick = async (n: Notif) => {
    if (!n.read) {
      await supabase.from("notifications").update({ read: true }).eq("id", n.id);
      setItems((prev) => prev.map((i) => i.id === n.id ? { ...i, read: true } : i));
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const dismiss = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from("notifications").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className={cn("size-4", shake && "animate-[wiggle_0.4s_ease-in-out_2]")} />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-bear text-bear-foreground text-[10px] font-bold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
          <div className="text-sm font-semibold">{lang === "tr" ? "Bildirimler" : "Notifications"}</div>
          {unread > 0 && (
            <button onClick={markAllRead} className="text-[11px] text-primary hover:underline flex items-center gap-1">
              <Check className="size-3" /> {lang === "tr" ? "Tümünü okundu" : "Mark all read"}
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          {items.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              {lang === "tr" ? "Henüz bildirim yok" : "No notifications yet"}
            </div>
          ) : items.map((n) => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={cn(
                "w-full px-3 py-2.5 text-left border-b border-border/30 hover:bg-accent/50 flex gap-2 items-start group",
                !n.read && "bg-primary/5"
              )}
            >
              <div className={cn("size-1.5 rounded-full mt-1.5 shrink-0", !n.read ? "bg-primary" : "bg-transparent")} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate">{n.title}</div>
                {n.body && <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{n.body}</div>}
                <div className="text-[10px] text-muted-foreground mt-1">
                  {new Date(n.created_at).toLocaleString(lang === "tr" ? "tr-TR" : "en-US", {
                    hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short",
                  })}
                </div>
              </div>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => dismiss(n.id, e)}
                className="opacity-0 group-hover:opacity-100 size-5 inline-flex items-center justify-center rounded hover:bg-accent shrink-0"
              >
                <X className="size-3" />
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
