import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, Loader2, Lock, ShieldCheck, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { concluirPrimeiroAcesso } from "@/lib/primeiro-acesso-troca.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/nova-senha")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Definir nova senha · CRM MK9" },
      { name: "description", content: "Troque sua senha temporária para acessar o CRM MK9." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NovaSenhaPage,
});

type Check = { label: string; ok: boolean };

function evaluate(pw: string): { checks: Check[]; score: number } {
  const checks: Check[] = [
    { label: "Pelo menos 8 caracteres", ok: pw.length >= 8 },
    { label: "Uma letra maiúscula", ok: /[A-Z]/.test(pw) },
    { label: "Uma letra minúscula", ok: /[a-z]/.test(pw) },
    { label: "Um número", ok: /\d/.test(pw) },
    { label: "Um caractere especial", ok: /[^A-Za-z0-9]/.test(pw) },
  ];
  const score = checks.filter((c) => c.ok).length;
  return { checks, score };
}

function NovaSenhaPage() {
  const navigate = useNavigate();
  const concluirFn = useServerFn(concluirPrimeiroAcesso);

  const [checking, setChecking] = useState(true);
  const [autorizado, setAutorizado] = useState(false);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { checks, score } = useMemo(() => evaluate(novaSenha), [novaSenha]);
  const forca =
    score <= 2
      ? { label: "Fraca", cls: "bg-destructive" }
      : score <= 3
        ? { label: "Média", cls: "bg-amber-500" }
        : score === 4
          ? { label: "Boa", cls: "bg-emerald-500" }
          : { label: "Forte", cls: "bg-emerald-600" };

  // Bloqueia o back/refresh: usuário só sai daqui concluindo ou fazendo logout.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error: sErr } = await supabase.auth.getUser();
      if (!mounted) return;
      if (sErr || !data.user) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      const { data: prof } = await supabase
        .from("profiles")
        .select("ativo, primeiro_acesso_pendente")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!mounted) return;
      if (!prof || prof.ativo === false) {
        await supabase.auth.signOut();
        navigate({ to: "/auth", search: { inactive: "1" }, replace: true });
        return;
      }
      if (prof.primeiro_acesso_pendente !== true) {
        navigate({ to: "/dashboard", replace: true });
        return;
      }
      setAutorizado(true);
      setChecking(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") navigate({ to: "/auth", replace: true });
    });

    // Bloqueia navegação "Voltar" mantendo a rota atual.
    const onPop = () => {
      window.history.pushState(null, "", window.location.href);
    };
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", onPop);

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      window.removeEventListener("popstate", onPop);
    };
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError(null);

    if (novaSenha.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (!/[A-Za-z]/.test(novaSenha) || !/\d/.test(novaSenha)) {
      setError("A senha deve conter letras e números.");
      return;
    }
    if (novaSenha !== confirmar) {
      setError("As senhas não coincidem.");
      return;
    }

    setSaving(true);
    try {
      const res = await concluirFn({ data: { nova_senha: novaSenha } });
      if (res?.ja_concluido) {
        toast.info("Seu primeiro acesso já havia sido concluído.");
      } else {
        toast.success("Senha definida! Bem-vindo(a) ao CRM MK9.");
      }
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Não foi possível concluir. Tente novamente.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!autorizado) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md border-border/60 shadow-lg">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="font-semibold tracking-tight">MK9 · CRM</span>
          </div>
          <CardTitle className="text-2xl">Crie sua nova senha</CardTitle>
          <CardDescription>
            Este é seu primeiro acesso. Substitua a senha temporária por uma senha pessoal para
            continuar utilizando o sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  className="pl-9 pr-10"
                  placeholder="Crie uma senha forte"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {novaSenha.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full ${forca.cls} transition-all`}
                        style={{ width: `${(score / 5) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-10 text-right">{forca.label}</span>
                  </div>
                  <ul className="space-y-1 text-xs">
                    {checks.map((c) => (
                      <li key={c.label} className="flex items-center gap-2">
                        {c.ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <span className={c.ok ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pw2">Confirmar nova senha</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="pw2"
                  type={showPw2 ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  className="pl-9 pr-10"
                  placeholder="Repita a nova senha"
                />
                <button
                  type="button"
                  onClick={() => setShowPw2((s) => !s)}
                  aria-label={showPw2 ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  {showPw2 ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? "Salvando..." : "Salvar e acessar o CRM"}
            </Button>

            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={handleLogout}
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                Sair e entrar com outra conta
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
