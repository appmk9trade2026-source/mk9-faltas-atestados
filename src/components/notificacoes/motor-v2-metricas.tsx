import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, ShieldCheck, XOctagon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

type Metrics = {
  materializadas_24h: number;
  materializadas_7d: number;
  materializadas_30d: number;
  suprimidas_24h: number;
  suprimidas_7d: number;
  suprimidas_30d: number;
  obrigatorias_24h: number;
  por_tipo_7d: Array<{ tipo: string; materializadas: number; suprimidas: number }>;
  por_severidade_7d: Array<{ severidade: string; materializadas: number; suprimidas: number }>;
};

type Health = {
  ok: boolean;
  catalogo_obrigatorios_ok: boolean;
  contadores_sem_negativos: boolean;
  notificacoes_v2_30d: number;
};

export function MotorV2Metricas() {
  const { data, isLoading } = useQuery({
    queryKey: ["motor-v2-metricas"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("metricas_notificacoes");
      if (error) throw error;
      return data as unknown as Metrics;
    },
    refetchInterval: 30_000,
  });

  const { data: health } = useQuery({
    queryKey: ["motor-v2-health"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("notificacoes_motor_healthcheck");
      if (error) throw error;
      return data as unknown as Health;
    },
    refetchInterval: 60_000,
  });

  if (isLoading || !data) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <Card><CardContent className="pt-6">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Materializadas 24h</span><CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-semibold">{data.materializadas_24h}</div>
          <div className="text-[11px] text-muted-foreground">7d: {data.materializadas_7d} · 30d: {data.materializadas_30d}</div>
        </CardContent></Card>

        <Card><CardContent className="pt-6">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Suprimidas 24h</span><XOctagon className="h-4 w-4 text-orange-500" />
          </div>
          <div className="mt-2 text-2xl font-semibold">{data.suprimidas_24h}</div>
          <div className="text-[11px] text-muted-foreground">7d: {data.suprimidas_7d} · 30d: {data.suprimidas_30d}</div>
        </CardContent></Card>

        <Card><CardContent className="pt-6">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Obrigatórias 24h</span><ShieldCheck className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-semibold">{data.obrigatorias_24h}</div>
          <div className="text-[11px] text-muted-foreground">Nunca suprimidas</div>
        </CardContent></Card>

        <Card><CardContent className="pt-6">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Healthcheck V2</span><Activity className={`h-4 w-4 ${health?.ok ? "text-emerald-500" : "text-destructive"}`} />
          </div>
          <div className="mt-2 text-2xl font-semibold">{health?.ok ? "OK" : "Falha"}</div>
          <div className="text-[11px] text-muted-foreground">
            Catálogo: {health?.catalogo_obrigatorios_ok ? "✓" : "✗"} · Contadores: {health?.contadores_sem_negativos ? "✓" : "✗"}
          </div>
        </CardContent></Card>
      </div>

      <Card><CardContent className="space-y-2 pt-6">
        <h4 className="text-sm font-semibold">Por tipo (7 dias)</h4>
        {data.por_tipo_7d.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem atividade nos últimos 7 dias.</p>
        ) : (
          <div className="space-y-1">
            {data.por_tipo_7d.map((t) => (
              <div key={t.tipo} className="flex items-center justify-between text-xs border-b py-1 last:border-0">
                <span className="font-mono">{t.tipo}</span>
                <div className="flex gap-2">
                  <Badge variant="secondary">{t.materializadas} mat.</Badge>
                  {t.suprimidas > 0 && <Badge variant="outline">{t.suprimidas} supr.</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>

      <Card><CardContent className="space-y-2 pt-6">
        <h4 className="text-sm font-semibold">Por severidade (7 dias)</h4>
        <div className="flex flex-wrap gap-2">
          {data.por_severidade_7d.map((s) => (
            <Badge key={s.severidade} variant="secondary">
              {s.severidade}: {s.materializadas} / <span className="opacity-60">supr. {s.suprimidas}</span>
            </Badge>
          ))}
          {data.por_severidade_7d.length === 0 && (
            <span className="text-xs text-muted-foreground">Sem dados.</span>
          )}
        </div>
      </CardContent></Card>
    </div>
  );
}
