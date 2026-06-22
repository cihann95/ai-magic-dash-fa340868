/* eslint-disable react-refresh/only-export-components */
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Lang } from "@/lib/i18n";

interface AppContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  realBalance: number;
  realBalanceLocked: number;
  isAdmin: boolean;
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: "dark" | "light";
  setTheme: (t: "dark" | "light") => void;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLangState] = useState<Lang>(
    (localStorage.getItem("lang") as Lang) || "tr"
  );
  const [realBalance, setRealBalance] = useState(0);
  const [realBalanceLocked, setRealBalanceLocked] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [theme, setThemeState] = useState<"dark" | "light">(
    (localStorage.getItem("theme") as "dark" | "light") || "dark"
  );

  useEffect(() => {
    if (!user) { setRealBalance(0); setRealBalanceLocked(0); setIsAdmin(false); return; }
    supabase.from("profiles").select("real_balance, real_balance_locked").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setRealBalance(Number(data.real_balance ?? 0));
          setRealBalanceLocked(Number(data.real_balance_locked ?? 0));
        }
      });
    supabase.rpc("has_role", { _user_id: user.id, _role: "admin" })
      .then(({ data }) => setIsAdmin(data === true));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`profile_balance_${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        (payload: { new: Record<string, unknown> }) => {
          if (payload.new.real_balance !== undefined) setRealBalance(Number(payload.new.real_balance));
          if (payload.new.real_balance_locked !== undefined) setRealBalanceLocked(Number(payload.new.real_balance_locked));
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s); setUser(s?.user ?? null); setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => { localStorage.setItem("lang", lang); document.documentElement.lang = lang; }, [lang]);

  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <AppContext.Provider value={{
      user, session, loading,
      realBalance, realBalanceLocked, isAdmin,
      lang, setLang: setLangState,
      theme, setTheme: setThemeState,
      signOut,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
