import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Gauge, Loader2, PlayCircle,
  RefreshCw, Repeat, ShieldAlert, ShieldCheck, Timer,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  useAutomacaoStatus, useProcessarEscalonamentos, useReprocessarEscalonamentos,
  type AutomacaoStatus,
} from "@/hooks/use-notificacoes";

type Execucao = {
  id: string;
  execution_id: string;
  status: string;
  origem: string;
  iniciado_em: string;
  finalizado_em: string | null;
  duracao_ms: number | null;
  processados: number;
  notificacoes_geradas: number;
  duplicidades_ignoradas: number;
  regras_avaliadas: number;
  erros_encontrados: number;
  mensagem_resumida: string | null;
};

function fmtDate(v: string | null | undefined) {
  return v ? new Date(v).toLocaleString("pt-BR") : "—";
}

function estadoBadge(estado: AutomacaoStatus["estado"]) {
  const map: Record<AutomacaoStatus["estado"], { label: string; cls: string; icon: React.ReactNode }> = {
    ATIVO: { label: "Ativo", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", icon: <ShieldCheck className="mr-1 h-3 w-3" /> },
    ATRASADO: { label: "Atrasado", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30", icon: <Clock className="mr-1 h-3 w-3" /> },
    COM_FALHA: { label: "Com falha", cls: "bg-red-500/15 text-red-600 border-red-500/30", icon: <ShieldAlert className="mr-1 h-3 w-3" /> },
    INATIVO: { label: "Inativo", cls: "bg-slate-500/15 text-slate-600 border-slate-500/30", icon: <Timer className="mr-1 h-3 w-3" /> },
    NAO_CONFIGURADO: { label: "Não configurado", cls: "bg-slate-500/15 text-slate-600 border-slate-500/30", icon: <AlertTriangle className="mr-1 h-3 w-3" /> },
  };
  const m = map[estado];
  return <Badge variant="outline" className={m.cls}>{m.icon}{m.label}</Badge>;
}

function statusExecBadge(s: string) {
  if (s === "CONCLUIDO" || s === "CONCLUIDO_COM_ALERTAS") return <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20">{s}</Badge>;
  if (s === "FALHOU") return <Badge variant="destructive">{s}</Badge>;
  if (s === "IGNORADO_POR_LOCK") return <Badge className="bg-slate-500/15 text-slate-600">{s}</Badge>;
  if (s === "INICIADO") return <Badge className="bg-blue-500/15 text-blue-600">{s}</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

export function AutomacaoStatusCards({ compact = false }: { compact?: boolean }) {
  const { data, isLoading, refetch, isFetching } = useAutomacaoStatus();
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!data) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Automação de SLA e Notificações</h3>
          {estadoBadge(data.estado)}
        </div>
        <Button size="sm" variant="ghost" onClick={() => refetch()}>
          {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <div className={`grid gap-3 ${compact ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
        <Mini icon={Clock} label="Frequência" value={`a cada ${data.intervalo_minutos} min`} sub={`tolerância ${data.tolerancia_minutos} min`} />
        <Mini icon={CheckCircle2} label="Última execução" value={fmtDate(data.ultima_execucao)} sub={data.ultima_execucao_status ?? "—"} />
        <Mini icon={ShieldAlert} label="Última falha" value={fmtDate(data.ultima_falha)} sub={data.falhas_consecutivas > 0 ? `${data.falhas_consecutivas} consecutivas` : "sem falhas recentes"} />
        <Mini icon={Timer} label="Próxima esperada" value={fmtDate(data.proxima_execucao_esperada)} sub={data.cron_configurado ? "cron ativo" : "cron indisponível"} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Mini icon={Gauge} label="Duração média (24h)" value={`${data.duracao_media_ms} ms`} />
        <Mini icon={Repeat} label="Notificações (24h)" value={String(data.notificacoes_24h)} />
        <Mini icon={ShieldCheck} label="Ignoradas por lock (24h)" value={String(data.ignoradas_por_lock_24h)} />
        <Mini icon={CheckCircle2} label="Último sucesso" value={fmtDate(data.ultimo_sucesso)} />
      </div>
    </div>
  );
}

function Mini({ icon: Icon, label, value, sub }: { icon: typeof Activity; label: string; value: string; sub?: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-1 text-sm font-semibold">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </CardContent></Card>
  );
}

export function MotorControls({ canWrite }: { canWrite: boolean }) {
  const processar = useProcessarEscalonamentos();
  const reprocessar = useReprocessarEscalonamentos();
  const [confirmType, setConfirmType] = useState<null | "MANUAL" | "REPROCESSAR">(null);
  const pending = processar.isPending || reprocessar.isPending;

  async function run() {
    try {
      const res = confirmType === "REPROCESSAR"
        ? await reprocessar.mutateAsync()
        : await processar.mutateAsync();
      setConfirmType(null);
      if (res.status === "IGNORADO_POR_LOCK") toast.warning("Execução ignorada: já existe uma execução ativa.");
      else if (res.status === "FALHOU") toast.error(`Execução falhou: ${res.erro ?? "erro"}`);
      else toast.success(`Concluído · ${res.gerados ?? 0} notificações geradas · ${res.duplicadas ?? 0} duplicadas ignoradas`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!canWrite) {
    return <p className="text-xs text-muted-foreground">Somente Super Admin pode executar o motor. Compliance possui acesso de leitura ao histórico.</p>;
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setConfirmType("MANUAL")} disabled={pending}>
          {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="mr-1.5 h-3.5 w-3.5" />}
          Executar agora
        </Button>
        <Button size="sm" variant="outline" onClick={() => setConfirmType("REPROCESSAR")} disabled={pending}>
          <Repeat className="mr-1.5 h-3.5 w-3.5" />
          Reprocessar pendências
        </Button>
      </div>
      <Dialog open={confirmType !== null} onOpenChange={(o) => !o && setConfirmType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmType === "REPROCESSAR" ? "Reprocessar pendências" : "Executar motor agora"}
            </DialogTitle>
            <DialogDescription>
              Esta operação é idempotente: notificações já materializadas não serão duplicadas.
              A execução usa lock para evitar concorrência e será registrada no histórico append-only.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmType(null)} disabled={pending}>Cancelar</Button>
            <Button onClick={run} disabled={pending}>
              {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function HistoricoExecucoes() {
  const [origem, setOrigem] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [busca, setBusca] = useState("");

  const q = useQuery({
    queryKey: ["esc-execs", origem, status],
    queryFn: async () => {
      let query = supabase.from("escalonamento_execucoes")
        .select("*").order("created_at", { ascending: false }).limit(200);
      if (origem !== "all") query = query.eq("origem", origem);
      if (status !== "all") query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as Execucao[];
    },
    refetchInterval: 30_000,
  });

  const rows = (q.data ?? []).filter((r) =>
    !busca || r.execution_id.toLowerCase().includes(busca.toLowerCase()) ||
    (r.mensagem_resumida ?? "").toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={origem} onValueChange={setOrigem}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Origem" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas origens</SelectItem>
            <SelectItem value="CRON">CRON</SelectItem>
            <SelectItem value="MANUAL">MANUAL</SelectItem>
            <SelectItem value="REPROCESSAMENTO">REPROCESSAMENTO</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="INICIADO">INICIADO</SelectItem>
            <SelectItem value="CONCLUIDO">CONCLUIDO</SelectItem>
            <SelectItem value="CONCLUIDO_COM_ALERTAS">CONCLUIDO_COM_ALERTAS</SelectItem>
            <SelectItem value="FALHOU">FALHOU</SelectItem>
            <SelectItem value="IGNORADO_POR_LOCK">IGNORADO_POR_LOCK</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Filtrar por execution_id / mensagem…" className="w-72" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {q.isLoading ? <Skeleton className="h-40 w-full" /> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Início</TableHead>
            <TableHead>Origem</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Duração</TableHead>
            <TableHead>Gerou</TableHead>
            <TableHead>Dup.</TableHead>
            <TableHead>Execution ID</TableHead>
            <TableHead>Mensagem</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">Nenhuma execução no filtro.</TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-xs">{fmtDate(r.iniciado_em)}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{r.origem}</Badge></TableCell>
                <TableCell>{statusExecBadge(r.status)}</TableCell>
                <TableCell className="text-xs">{r.duracao_ms != null ? `${r.duracao_ms} ms` : "—"}</TableCell>
                <TableCell className="text-xs">{r.notificacoes_geradas}</TableCell>
                <TableCell className="text-xs">{r.duplicidades_ignoradas}</TableCell>
                <TableCell className="font-mono text-[10px] text-muted-foreground">{r.execution_id.slice(0, 8)}…</TableCell>
                <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">{r.mensagem_resumida ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
