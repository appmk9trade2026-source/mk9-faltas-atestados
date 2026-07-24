import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, Lock, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Definir senha · CRM MK9" },
      { name: "description", content: "Defina sua senha de acesso ao CRM MK9." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    const dev = import.meta.env.DEV;
    const log = (...a: unknown[]) => { if (dev) console.info("[reset-password]", ...a); };

    let cancelled = false;

    async function bootstrap() {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const code = url.searchParams.get("code");
      const errParam = url.searchParams.get("error") ?? hash.get("error");
      const errCode = url.searchParams.get("error_code") ?? hash.get("error_code");
      const errDesc = url.searchParams.get("error_description") ?? hash.get("error_description");
      const hashAccess = hash.get("access_token");
      const hashRefresh = hash.get("refresh_token");
      const hashType = hash.get("type");

      log("params", {
        hasCode: !!code,
        hasHashAccess: !!hashAccess,
        hasHashRefresh: !!hashRefresh,
        hashType,
        errParam,
        errCode,
      });

      if (errParam || errCode) {
        const msg =
          errCode === "otp_expired"
            ? "O link expirou. Solicite um novo em 'Esqueci minha senha'."
            : (errDesc ? decodeURIComponent(errDesc.replace(/\+/g, " ")) : "Link inválido.");
        setLinkError(msg);
        setReady(true);
        return;
      }

      // 1) Fluxo PKCE moderno: /reset-password?code=...
      if (code) {
        const { data, error: exErr } = await supabase.auth.exchangeCodeForSession(code);
        log("exchangeCodeForSession", { hasSession: !!data?.session, error: exErr?.message });
        if (cancelled) return;
        if (exErr) {
          setLinkError(
            exErr.message.toLowerCase().includes("expire")
              ? "O link expirou. Solicite um novo em 'Esqueci minha senha'."
              : `Não foi possível validar o link: ${exErr.message}`,
          );
          setReady(true);
          return;
        }
        window.history.replaceState({}, "", window.location.pathname);
        setHasSession(!!data.session);
        setReady(true);
        return;
      }

      // 2) Fluxo hash legado (#access_token=...&type=recovery)
      if (hashAccess && hashRefresh) {
        const { data, error: sErr } = await supabase.auth.setSession({
          access_token: hashAccess,
          refresh_token: hashRefresh,
        });
        log("setSession(hash)", { hasSession: !!data?.session, error: sErr?.message });
        if (cancelled) return;
        if (sErr) {
          setLinkError(`Não foi possível validar o link: ${sErr.message}`);
          setReady(true);
          return;
        }
        window.history.replaceState({}, "", window.location.pathname);
        setHasSession(!!data.session);
        setReady(true);
        return;
      }

      // 3) Sem parâmetros — verifica sessão existente
      const { data } = await supabase.auth.getSession();
      log("getSession(fallback)", { hasSession: !!data.session });
      if (cancelled) return;
      setHasSession(!!data.session);
      setReady(true);
    }

    bootstrap();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      log("onAuthStateChange", event, { hasSession: !!session });
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setHasSession(!!session);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (import.meta.env.DEV) console.info("[reset-password] pre-updateUser", { hasSession: !!sess.session });
      if (!sess.session) {
        setError("Sessão de recuperação ausente. Reabra o link do e-mail e tente novamente.");
        return;
      }
      const { error: upErr } = await supabase.auth.updateUser({ password });
      if (import.meta.env.DEV) console.info("[reset-password] updateUser", { error: upErr?.message });
      if (upErr) {
        const msg = upErr.message || "";
        if (/same[_ ]password|different from the old/i.test(msg)) {
          setError("A nova senha precisa ser diferente da atual.");
        } else if (/session|jwt|expire/i.test(msg)) {
          setError("A sessão de recuperação expirou. Solicite um novo link.");
        } else {
          setError(msg || "Não foi possível definir a senha.");
        }
        return;
      }
      toast.success("Senha definida com sucesso.");
      await supabase.auth.signOut();
      navigate({ to: "/auth", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro inesperado.";
      if (import.meta.env.DEV) console.error("[reset-password] exception", err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md border-border/60 shadow-sm">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <span className="font-semibold">MK9 · CRM</span>
          </div>
          <CardTitle className="text-2xl">Definir nova senha</CardTitle>
          <CardDescription>
            Escolha uma senha forte para acessar o sistema. Mínimo de 8 caracteres.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!ready ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !hasSession ? (
            <Alert variant="destructive">
              <AlertDescription>
                Link inválido ou expirado. Solicite um novo link em "Esqueci minha senha" ou
                "Primeiro acesso" na tela de login.
              </AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="pw">Nova senha</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="pw"
                    type={showPw ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                    aria-label={showPw ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw2">Confirmar senha</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="pw2"
                    type={showPw ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? "Salvando..." : "Salvar nova senha"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
