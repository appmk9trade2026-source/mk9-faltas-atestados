import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, fmtDuration } from "@/lib/whatsapp-format";
import { logWhatsappAdminEvent } from "@/lib/whatsapp-admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/comunicacoes/whatsapp/execucoes")({
  component: ExecPage,
});

type Row = {
  id: string;
  execution_id: string;
  worker: string;
  status: string;
  inicio: string;
  fim: string | null;
  duracao_ms: number | null;
  selecionadas: number;
  enviadas: number;
  falhas_temporarias: number;
  falhas_definitivas: number;
  ignoradas: number;
};

const PAGE_SIZE = 30;

function statusBadge(s: string) {
  const cls =
    s === "OK"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : s === "ERRO"
        ? "bg-red-500/15 text-red-700 dark:text-red-300"
        : "bg-muted text-muted-foreground";
  return <Badge variant="outline" className={cls}>{s}</Badge>;
}

function ExecPage() {
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [workerFilter, setWorkerFilter] = useState<string>("");
  const [page, setPage] = useState(0);
  const logEvent = useServerFn(logWhatsappAdminEvent);

  const q = useQuery({
    queryKey: ["wa-exec", statusFilter, workerFilter, page],
    queryFn: async () => {
      let query = supabase
        .from("whatsapp_worker_execucoes")
        .select(
          "id, execution_id, worker, status, inicio, fim, duracao_ms, selecionadas, enviadas, falhas_temporarias, falhas_definitivas, ignoradas",
          { count: "exact" },
        )
        .order("inicio", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (statusFilter !== "ALL") query = query.eq("status", statusFilter);
      if (workerFilter.trim()) query = query.ilike("worker", `%${workerFilter.trim()}%`);
      const { data, count, error } = await query;
      if (error) throw error;
      return { rows: (data ?? []) as Row[], count: count ?? 0 };
    },
  });

  const rows = q.data?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil((q.data?.count ?? 0) / PAGE_SIZE));

  async function exportCsv() {
    const header = ["execution_id", "worker", "status", "inicio", "fim", "duracao_ms", "selecionadas", "enviadas", "falhas_temporarias", "falhas_definitivas", "ignoradas"];
    const lines = [header.join(",")];
    for (const r of rows) {
      const cells = [
        r.execution_id, r.worker, r.status, r.inicio, r.fim ?? "",
        String(r.duracao_ms ?? ""), String(r.selecionadas), String(r.enviadas),
        String(r.falhas_temporarias), String(r.falhas_definitivas), String(r.ignoradas),
      ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `whatsapp-worker-execucoes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    logEvent({ data: { acao: "WHATSAPP_EXPORT_EXECUCOES", observacoes: `Exportação CSV (${rows.length} execuções).` } }).catch(() => {});
    toast.success("Exportação concluída.");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <div className="grid gap-1">
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="OK">OK</SelectItem>
              <SelectItem value="ERRO">ERRO</SelectItem>
              <SelectItem value="PROVIDER_DESATIVADO">Provider desativado</SelectItem>
              <SelectItem value="SEM_ITENS">Sem itens</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Worker</Label>
          <Input value={workerFilter} onChange={(e) => { setWorkerFilter(e.target.value); setPage(0); }} placeholder="ex: cron-worker" className="w-48" />
        </div>
        <Button variant="outline" size="sm" onClick={() => q.refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
        </Button>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
          <Download className="mr-2 h-4 w-4" /> Exportar CSV
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Execution ID</TableHead>
                <TableHead>Worker</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Fim</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead>Selec.</TableHead>
                <TableHead>Enviadas</TableHead>
                <TableHead>Falha temp.</TableHead>
                <TableHead>Falha def.</TableHead>
                <TableHead>Ignoradas</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 11 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-10 text-center text-sm text-muted-foreground">
                    Nenhuma execução registrada.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-[160px] truncate font-mono text-xs">{r.execution_id}</TableCell>
                    <TableCell className="text-xs">{r.worker}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{fmtDate(r.inicio)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{fmtDate(r.fim)}</TableCell>
                    <TableCell className="text-xs tabular-nums">{fmtDuration(r.duracao_ms)}</TableCell>
                    <TableCell className="text-xs tabular-nums">{r.selecionadas}</TableCell>
                    <TableCell className="text-xs tabular-nums text-emerald-600 dark:text-emerald-400">{r.enviadas}</TableCell>
                    <TableCell className="text-xs tabular-nums text-amber-600 dark:text-amber-400">{r.falhas_temporarias}</TableCell>
                    <TableCell className="text-xs tabular-nums text-red-600 dark:text-red-400">{r.falhas_definitivas}</TableCell>
                    <TableCell className="text-xs tabular-nums">{r.ignoradas}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
          <div>{q.data?.count ?? 0} execuções · página {page + 1} de {totalPages}</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Anterior</Button>
            <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
