import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  const [error, setError] = useState<string | null>(inactive ? "Sua conta está inativa. Contate o Super Admin." : null);

  // Redireciona se já logado
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data, error: signErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signErr || !data.user) {
        setError("E-mail ou senha inválidos.");
        return;
      }
      // Verifica se ativo
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
      {/* Lateral visual */}
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
        <p className="text-xs text-primary-foreground/60">© {new Date().getFullYear()} MK9. Acesso restrito.</p>
      </div>

      {/* Formulário */}
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
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@mk9.com.br"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
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
                Entrar
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                O acesso é criado pelo Super Admin. Sem cadastro público.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
