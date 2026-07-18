import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Sparkles, RefreshCw, ExternalLink, Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Health = {
  status: string;
  refresh_habilitado?: boolean;
  ultimo_sucesso?: string | null;
  proxima_execucao_esperada?: string | null;
  idade_minutos?: number | null;
  duracao_media_ms?: number | null;
  linhas_processadas_ultima_execucao?: number | null;
  falhas_consecutivas?: number;
  execucoes_ignoradas_por_lock_24h?: number;
  intervalo_configurado?: number;
  tolerancia_configurada?: number;
};

const statusVariant: Record<string, string> = {
  ATUALIZADO: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300",
  PROCESSANDO: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300",
  DESATUALIZADO: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300",
  COM_FALHA: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300",
  INATIVO: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  SEM_DADOS: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  NAO_CONFIGURADO: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

export function BIHealthCard({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["bi-health"],
    queryFn: async () => {
      const { data, error } = await sb.rpc("bi_healthcheck");
      if (error) throw error;
      return data as Health;
    },
    refetchInterval: 60_000,
  });

  const refresh = useMutation({
    mutationFn: async () => {
      const { data, error } = await sb.rpc("refresh_bi_absenteismo", { p_origem: "MANUAL" });
      if (error) throw error;
      return data;
    },
    onSuccess: (r) => {
      const rr = r as { status?: string; linhas?: number };
      if (rr?.status === "CONCLUIDO") toast.success(`BI atualizado · ${rr.linhas ?? 0} linhas`);
      else if (rr?.status === "IGNORADO_POR_LOCK") toast.info("Outra execução em andamento");
      else toast.error("Falha ao atualizar BI");
      qc.invalidateQueries({ queryKey: ["bi-health"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const h = q.data;
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-semibold">BI Executivo de Absenteísmo</h3>
              <p className="text-xs text-muted-foreground">Refresh automático via <code>pg_cron</code> — job <code>crm_mk9_refresh_bi_absenteismo</code></p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/bi-executivo"><ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir BI</Link>
            </Button>
            {canWrite && (
              <Button size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
                <RefreshCw className={"h-3.5 w-3.5 mr-1 " + (refresh.isPending ? "animate-spin" : "")} /> Executar agora
              </Button>
            )}
          </div>
        </div>

        {q.isLoading ? <Skeleton className="h-20 mt-4" /> : h ? (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-4">
            <Info label="Estado">
              <Badge variant="outline" className={statusVariant[h.status] ?? ""}>{h.status}</Badge>
            </Info>
            <Info label="Última atualização">
              {h.ultimo_sucesso ? format(new Date(h.ultimo_sucesso), "dd/MM HH:mm", { locale: ptBR }) : "—"}
            </Info>
            <Info label="Próximo refresh">
              {h.proxima_execucao_esperada ? format(new Date(h.proxima_execucao_esperada), "dd/MM HH:mm", { locale: ptBR }) : "—"}
            </Info>
            <Info label="Duração média">
              {h.duracao_media_ms ? `${Math.round(h.duracao_media_ms)} ms` : "—"}
            </Info>
            <Info label="Linhas (última exec.)">{h.linhas_processadas_ultima_execucao ?? "—"}</Info>
            <Info label="Falhas consecutivas">
              <span className={h.falhas_consecutivas && h.falhas_consecutivas > 0 ? "text-red-600 font-semibold" : ""}>
                {h.falhas_consecutivas ?? 0}
              </span>
            </Info>
            {(h.execucoes_ignoradas_por_lock_24h ?? 0) > 0 && (
              <Info label="Ignoradas por lock (24h)">
                <span className="text-amber-600">{h.execucoes_ignoradas_por_lock_24h}</span>
              </Info>
            )}
            <Info label="Intervalo">{h.intervalo_configurado ?? "—"} min</Info>
            <Info label="Tolerância">{h.tolerancia_configurada ?? "—"} min</Info>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mt-4 flex items-center gap-2">
            <Activity className="h-4 w-4" /> Sem dados do healthcheck.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="p-2 border rounded-md">
      <div className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{children}</div>
    </div>
  );
}
