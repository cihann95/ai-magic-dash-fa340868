import { useState, useMemo } from "react";
import { useNavigate, useSearchParams, useLocation, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { LineChart, Loader2, Eye, EyeOff } from "lucide-react";

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { score, label: "Weak", color: "bg-destructive" };
  if (score <= 3) return { score, label: "Medium", color: "bg-yellow-500" };
  return { score, label: "Strong", color: "bg-emerald-500" };
}

export default function Auth() {
  const { lang } = useApp();
  const tr = t(lang);
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const navigate = useNavigate();

  // Redirect target: location.state.from (from ProtectedRoute) or ?returnTo= or "/"
  const returnTo = searchParams.get("returnTo") || (location.state as { from?: string })?.from || "/";

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: {
            data: { display_name: displayName || email.split("@")[0] },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast({
            title: tr.success,
            description: lang === "tr"
              ? "Hesabınız oluşturuldu. Lütfen e-postanızdaki doğrulama bağlantısına tıklayın, ardından giriş yapın."
              : "Account created. Please click the verification link in your email, then sign in.",
          });
          setMode("signin");
        } else {
          toast({ title: tr.success, description: tr.account_created });
          navigate(returnTo, { replace: true });
        }
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setFailedAttempts(0);
        navigate(returnTo, { replace: true });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast({ title: tr.success, description: tr.reset_link_sent });
        setMode("signin");
      }
    } catch (err) {
      if (mode === "signin") {
        setFailedAttempts((prev) => prev + 1);
      }
      toast({ title: tr.error, description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen mesh-bg flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between max-w-6xl mx-auto w-full">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg">
          <div className="size-8 rounded-lg gradient-primary shadow-glow flex items-center justify-center">
            <LineChart className="size-4 text-primary-foreground" />
          </div>
          <span className="text-gradient">Lumen Trade</span>
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 glass shadow-elegant border-border/50 animate-fade-in">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold tracking-tight">
              {mode === "signin" ? tr.welcome_back : mode === "signup" ? tr.create_account : tr.reset_password}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "signup" ? tr.hero_sub.slice(0, 60) + "…" : ""}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="name">{tr.display_name}</Label>
                <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Alex" autoComplete="name" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">{tr.email}</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </div>
            {mode !== "forgot" && (
              <div className="space-y-2">
                <Label htmlFor="password">{tr.password}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {mode === "signup" && password.length > 0 && (
                  <div className="space-y-1">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                        style={{ width: `${(strength.score / 5) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{strength.label}</p>
                  </div>
                )}
              </div>
            )}

            {mode === "signin" && failedAttempts >= 3 && (
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                Too many attempts. Please wait a few minutes.
              </p>
            )}

            <Button type="submit" disabled={loading} className="w-full gradient-primary text-primary-foreground shadow-glow h-11">
              {loading && <Loader2 className="size-4 animate-spin" />}
              {mode === "signin" ? tr.signin : mode === "signup" ? tr.signup : tr.send_reset_link}
            </Button>
          </form>

          <div className="mt-6 text-sm text-center space-y-2">
            {mode === "signin" && (
              <>
                <button type="button" onClick={() => setMode("forgot")} className="text-muted-foreground hover:text-foreground">{tr.forgot_password}</button>
                <div className="text-muted-foreground">
                  {tr.no_account}{" "}
                  <button type="button" onClick={() => setMode("signup")} className="text-primary font-medium hover:underline">{tr.signup}</button>
                </div>
              </>
            )}
            {mode === "signup" && (
              <div className="text-muted-foreground">
                {tr.have_account}{" "}
                <button type="button" onClick={() => setMode("signin")} className="text-primary font-medium hover:underline">{tr.signin}</button>
              </div>
            )}
            {mode === "forgot" && (
              <button type="button" onClick={() => setMode("signin")} className="text-muted-foreground hover:text-foreground">← {tr.signin}</button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
