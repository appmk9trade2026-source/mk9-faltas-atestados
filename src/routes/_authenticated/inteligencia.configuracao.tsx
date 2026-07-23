import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/inteligencia/configuracao")({
  head: () => ({
    meta: [
      { title: "Configuração da Inteligência · CRM MK9" },
      { name: "description", content: "Pesos e limiares do score de absenteísmo." },
    ],
  }),
  component: RedirectToInteligencia,
});

function RedirectToInteligencia() {
  return <Navigate to="/inteligencia" search={{ tab: "configuracao" }} replace />;
}

type Config = {
  id: string;
  peso_falta: number;
  peso_atestado: number;
  peso_declaracao: number;
  peso_suspensao: number;
  peso_acidente_trabalho: number;
  peso_acidente_trajeto: number;
  peso_outros: number;
  peso_dia_perdido: number;
  peso_reincidencia: number;
  reincidencia_janela_dias: number;
  reincidencia_min_ocorrencias: number;
  janela_dias: number;
  limiar_atencao: number;
  limiar_alta: number;
  limiar_critica: number;
  alerta_janela_dias: number;
  alerta_crescimento_pct: number;
  alerta_limite_reincidencia: number;
  alerta_limite_dias_perdidos: number;
  alerta_limite_mudanca_criticidade: number;
  alerta_limite_criticos_equipe: number;
  alerta_limite_absenteismo_projeto: number;
  alerta_sensibilidade: "BAIXA" | "MEDIA" | "ALTA";
};

const PESO_FIELDS: Array<{ key: keyof Config; label: string; hint?: string }> = [
  { key: "peso_falta", label: "Falta injustificada" },
  { key: "peso_atestado", label: "Atestado médico" },
  { key: "peso_declaracao", label: "Declaração de comparecimento" },
  { key: "peso_suspensao", label: "Suspensão disciplinar" },
  { key: "peso_acidente_trabalho", label: "Acidente de trabalho" },
  { key: "peso_acidente_trajeto", label: "Acidente de trajeto" },
  { key: "peso_outros", label: "Outros" },
];

export function ConfiguracaoPage() {
  const { loading, roles } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isSuperAdmin = roles.includes("super_admin");
  const [form, setForm] = useState<Config | null>(null);

  const query = useQuery({
    queryKey: ["inteligencia", "config"],
    queryFn: async (): Promise<Config> => {
      const { data, error } = await supabase
        .from("absenteismo_config")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Configuração não encontrada");
      return data as Config;
    },
  });

  useEffect(() => {
    if (query.data) setForm(query.data);
  }, [query.data]);

  const save = useMutation({
    mutationFn: async (payload: Config) => {
      const { id, ...rest } = payload;
      const { error } = await supabase.from("absenteismo_config").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração salva");
      queryClient.invalidateQueries({ queryKey: ["inteligencia"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Falha ao salvar"),
  });

  if (loading || query.isLoading || !form) {
    return (
      <AppShell title="Configuração da Inteligência">
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    );
  }

  if (!isSuperAdmin) {
    return (
      <AppShell title="Configuração da Inteligência">
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Apenas o Super Admin pode editar os pesos da inteligência de absenteísmo.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => navigate({ to: "/inteligencia" })}>
              Voltar
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const update = <K extends keyof Config>(key: K, value: string) => {
    const num = Number(value);
    setForm((f) => (f ? { ...f, [key]: Number.isFinite(num) ? num : f[key] } : f));
  };

  const limiaresValidos =
    form.limiar_atencao > 0 &&
    form.limiar_alta > form.limiar_atencao &&
    form.limiar_critica > form.limiar_alta;

  return (
    <AppShell title="Configuração da Inteligência">
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-xl font-semibold">Pesos & Limiares</h1>
              <p className="text-sm text-muted-foreground">
                Ajuste como cada tipo de ausência contribui para o score de criticidade.
              </p>
            </div>
          </div>
          <Button variant="ghost" asChild>
            <Link to="/inteligencia">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pesos por tipo de ausência</CardTitle>
            <CardDescription>
              Cada ocorrência soma o peso do tipo correspondente ao score do colaborador.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {PESO_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={f.key}>{f.label}</Label>
                <Input
                  id={f.key}
                  type="number"
                  step="0.5"
                  min="0"
                  value={form[f.key] as number}
                  onChange={(e) => update(f.key, e.target.value)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dias perdidos & Reincidência</CardTitle>
            <CardDescription>
              Peso adicional por dia parado e bônus quando há muitas ocorrências em curto período.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Peso por dia perdido</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={form.peso_dia_perdido}
                onChange={(e) => update("peso_dia_perdido", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Bônus de reincidência</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                value={form.peso_reincidencia}
                onChange={(e) => update("peso_reincidencia", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Janela de reincidência (dias)</Label>
              <Input
                type="number"
                min="1"
                value={form.reincidencia_janela_dias}
                onChange={(e) => update("reincidencia_janela_dias", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ocorrências mínimas p/ reincidência</Label>
              <Input
                type="number"
                min="1"
                value={form.reincidencia_min_ocorrencias}
                onChange={(e) => update("reincidencia_min_ocorrencias", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Janela de análise e limiares</CardTitle>
            <CardDescription>
              Todas as ausências dentro da janela são consideradas. Os limiares definem o nível
              exibido no ranking.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Janela de análise (dias)</Label>
              <Input
                type="number"
                min="7"
                max="365"
                value={form.janela_dias}
                onChange={(e) => update("janela_dias", e.target.value)}
              />
            </div>
            <div />
            <div className="space-y-1.5">
              <Label>Limiar Atenção (score ≥)</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                value={form.limiar_atencao}
                onChange={(e) => update("limiar_atencao", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Limiar Alta (score ≥)</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                value={form.limiar_alta}
                onChange={(e) => update("limiar_alta", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Limiar Crítica (score ≥)</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                value={form.limiar_critica}
                onChange={(e) => update("limiar_critica", e.target.value)}
              />
            </div>
            {!limiaresValidos && (
              <p className="text-xs text-destructive sm:col-span-2">
                Os limiares devem obedecer: Atenção &lt; Alta &lt; Crítica, todos positivos.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alertas Inteligentes</CardTitle>
            <CardDescription>
              Parâmetros usados pelo motor para detectar situações relevantes automaticamente.
              Alterações valem para a próxima execução da detecção.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Janela de análise dos alertas (dias)</Label>
              <Input type="number" min="7" max="365" value={form.alerta_janela_dias}
                onChange={(e) => update("alerta_janela_dias", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Crescimento significativo (%)</Label>
              <Input type="number" min="0" step="1" value={form.alerta_crescimento_pct}
                onChange={(e) => update("alerta_crescimento_pct", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Limite de reincidência (faltas + atestados)</Label>
              <Input type="number" min="1" value={form.alerta_limite_reincidencia}
                onChange={(e) => update("alerta_limite_reincidencia", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Limite de dias perdidos</Label>
              <Input type="number" min="1" value={form.alerta_limite_dias_perdidos}
                onChange={(e) => update("alerta_limite_dias_perdidos", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Mudança de criticidade (níveis)</Label>
              <Input type="number" min="1" value={form.alerta_limite_mudanca_criticidade}
                onChange={(e) => update("alerta_limite_mudanca_criticidade", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Colaboradores críticos por equipe</Label>
              <Input type="number" min="1" value={form.alerta_limite_criticos_equipe}
                onChange={(e) => update("alerta_limite_criticos_equipe", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Concentração de criticidade por projeto (%)</Label>
              <Input type="number" min="0" max="100" value={form.alerta_limite_absenteismo_projeto}
                onChange={(e) => update("alerta_limite_absenteismo_projeto", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Sensibilidade da detecção</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.alerta_sensibilidade}
                onChange={(e) => setForm((f) => f ? { ...f, alerta_sensibilidade: e.target.value as Config["alerta_sensibilidade"] } : f)}
              >
                <option value="BAIXA">Baixa (menos alertas)</option>
                <option value="MEDIA">Média (equilibrado)</option>
                <option value="ALTA">Alta (mais sensível)</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Separator />

        <div className="flex justify-end">
          <Button
            onClick={() => form && save.mutate(form)}
            disabled={!limiaresValidos || save.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            Salvar configuração
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
