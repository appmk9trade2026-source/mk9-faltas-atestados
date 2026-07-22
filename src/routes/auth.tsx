import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, Loader2, ShieldCheck, Mail, Lock, KeyRound, UserPlus } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { solicitarPrimeiroAcesso } from "@/lib/primeiro-acesso.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";


const searchSchema = z.object({
  inactive: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Entrar · CRM MK9" },
      { name: "description", content: "Acesso restrito ao CRM de Faltas e Atestados da MK9." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { inactive } = useSearch({ from: "/auth" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    inactive ? "Sua conta está inativa. Contate o Super Admin." : null,
  );

  const [forgotOpen, setForgotOpen] = useState(false);
  const [firstAccessOpen, setFirstAccessOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const { data, error: signErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signErr || !data.user) {
        setError("E-mail ou senha inválidos.");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("ativo")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!profile || profile.ativo === false) {
        await supabase.auth.signOut();
        setError("Sua conta está inativa. Contate o Super Admin.");
        return;
      }
      toast.success("Bem-vindo!");
      navigate({ to: "/dashboard", replace: true });
    } catch {
      setError("Não foi possível entrar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-10 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground relative overflow-hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-foreground/10 backdrop-blur">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <span className="font-semibold tracking-tight">MK9 · CRM</span>
        </div>
        <div className="space-y-3 max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">
            Gestão de faltas e atestados, do jeito certo.
          </h2>
          <p className="text-sm text-primary-foreground/80">
            Registre, acompanhe e controle o lançamento no sistema externo — com segurança,
            rastreabilidade e uma operação de RH mais leve.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/60">
          © {new Date().getFullYear()} MK9. Acesso restrito.
        </p>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-border/60 shadow-sm">
          <CardHeader className="space-y-1">
            <div className="lg:hidden flex items-center gap-2 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <span className="font-semibold">MK9 · CRM</span>
            </div>
            <CardTitle className="text-2xl">Entrar</CardTitle>
            <CardDescription>Use suas credenciais corporativas para acessar o sistema.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@mk9.com.br"
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Senha</Label>
                  <button
                    type="button"
                    onClick={() => setForgotOpen(true)}
                    className="text-xs text-primary hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
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
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? "Entrando..." : "Entrar"}
              </Button>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border/60" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-2 text-muted-foreground">ou</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setFirstAccessOpen(true)}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Primeiro acesso? Criar senha
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                O acesso é criado pelo Super Admin. Sem cadastro público.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>

      <PasswordEmailDialog
        open={forgotOpen}
        onOpenChange={setForgotOpen}
        title="Recuperar senha"
        description="Informe seu e-mail corporativo. Se houver uma conta associada, enviaremos instruções para redefinir a senha."
        icon={<KeyRound className="h-4 w-4" />}
        submitLabel="Enviar link de recuperação"
      />
      <PasswordEmailDialog
        open={firstAccessOpen}
        onOpenChange={setFirstAccessOpen}
        title="Primeiro acesso"
        description="Informe o e-mail corporativo cadastrado pelo administrador. Se houver conta ativa, enviaremos um link seguro para você definir sua senha."
        icon={<UserPlus className="h-4 w-4" />}
        submitLabel="Enviar link de criação de senha"
      />
    </div>
  );
}

function PasswordEmailDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  submitLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  icon: React.ReactNode;
  submitLabel: string;
}) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [techError, setTechError] = useState<string | null>(null);
  const primeiroAcessoFn = useServerFn(solicitarPrimeiroAcesso);

  useEffect(() => {
    if (!open) {
      setEmail("");
      setSending(false);
      setSent(false);
      setTechError(null);
    }
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setTechError(null);
    try {
      const client_request_id =
        globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const res = await primeiroAcessoFn({
        data: {
          email,
          redirect_to: `${window.location.origin}/reset-password`,
          client_request_id,
          user_agent: navigator.userAgent.slice(0, 500),
        },
      });
      if (res?.ok) {
        setSent(true);
      } else {
        setTechError(
          "Não foi possível concluir a solicitação neste momento. Tente novamente em alguns minutos.",
        );
      }
    } catch {
      setTechError(
        "Não foi possível concluir a solicitação neste momento. Tente novamente em alguns minutos.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {icon}
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {sent ? (
          <Alert>
            <AlertDescription>
              Caso exista uma conta ativa para este e-mail, você receberá em instantes um link
              seguro para prosseguir. Verifique também a caixa de spam.
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {techError && (
              <Alert variant="destructive">
                <AlertDescription>{techError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="dlg-email">E-mail</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="dlg-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@mk9.com.br"
                  className="pl-9"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={sending}>
                {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
