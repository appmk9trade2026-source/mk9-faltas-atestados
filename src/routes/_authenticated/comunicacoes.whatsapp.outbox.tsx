import { WhatsappRouteError, WhatsappRouteLoading, WhatsappRouteNotFound } from "@/components/whatsapp/route-boundaries";
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Filter, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WhatsappStatusBadge } from "@/components/whatsapp/status-badge";
import { WhatsappTimeline, type TimelineEvent } from "@/components/whatsapp/timeline";
import { WA_STATUS, fmtDate, maskPhoneDisplay } from "@/lib/whatsapp-format";
import { logWhatsappAdminEvent } from "@/lib/whatsapp-admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/comunicacoes/whatsapp/outbox")({
  component: OutboxPage,
  errorComponent: ({ error, reset }) => <WhatsappRouteError error={error} reset={reset} />,
  notFoundComponent: () => <WhatsappRouteNotFound />,
  pendingComponent: () => <WhatsappRouteLoading />,
});

type Row = {
  id: string;
  status: string;
  created_at: string;
  processado_em: string | null;
  enviado_em: string | null;
  confirmado_em: string | null;
  falhou_em: string | null;
  publico: string;
  template_codigo: string;
  telefone_mascarado: string;
  tentativas: number;
  max_tentativas: number;
  proxima_tentativa_em: string;
  provider_message_id: string | null;
  locked_by: string | null;
  ultimo_erro_codigo: string | null;
  ultimo_erro_resumido: string | null;
  evento_tipo: string;
  evento_id: string;
};

const PAGE_SIZE = 25;

function OutboxPage() {
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [templateFilter, setTemplateFilter] = useState("");
  const [publicoFilter, setPublicoFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Row | null>(null);
  const logEvent = useServerFn(logWhatsappAdminEvent);

  const q = useQuery({
    queryKey: ["wa-outbox", statusFilter, templateFilter, publicoFilter, search, page],
    queryFn: async ({ signal }) => {
      let query = supabase
        .from("whatsapp_outbox")
        .select(
          "id, status, created_at, processado_em, enviado_em, confirmado_em, falhou_em, publico, template_codigo, telefone_mascarado, tentativas, max_tentativas, proxima_tentativa_em, provider_message_id, locked_by, ultimo_erro_codigo, ultimo_erro_resumido, evento_tipo, evento_id",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
        .abortSignal(signal);

      if (statusFilter !== "ALL") query = query.eq("status", statusFilter as "PENDENTE");
      if (publicoFilter !== "ALL") query = query.eq("publico", publicoFilter as "COLABORADOR");

      if (templateFilter.trim()) query = query.ilike("template_codigo", `%${templateFilter.trim()}%`);
      if (search.trim()) {
        const s = search.trim();
        query = query.or(
          `provider_message_id.ilike.%${s}%,evento_id.ilike.%${s}%,template_codigo.ilike.%${s}%`,
        );
      }
      const { data, count, error } = await query;
      if (error) throw error;
      return { rows: (data ?? []) as Row[], count: count ?? 0 };
    },
  });

  const totalPages = Math.max(1, Math.ceil((q.data?.count ?? 0) / PAGE_SIZE));

  const timelineQ = useQuery({
    queryKey: ["wa-timeline", selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_outbox_eventos")
        .select("id, evento, status_anterior, status_novo, codigo, mensagem_resumida, metadata_segura, created_at")
        .eq("outbox_id", selected!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TimelineEvent[];
    },
  });

  const rows = q.data?.rows ?? [];

  async function exportCsv() {
    const header = [
      "status",
      "criado_em",
      "publico",
      "template",
      "telefone_mascarado",
      "tentativas",
      "provider_message_id",
      "worker",
      "ultimo_erro",
      "processado_em",
      "enviado_em",
      "confirmado_em",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      const cells = [
        r.status,
        r.created_at,
        r.publico,
        r.template_codigo,
        maskPhoneDisplay(r.telefone_mascarado),
        String(r.tentativas),
        r.provider_message_id ?? "",
        r.locked_by ?? "",
        r.ultimo_erro_codigo ?? "",
        r.processado_em ?? "",
        r.enviado_em ?? "",
        r.confirmado_em ?? "",
      ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `whatsapp-outbox-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    try {
      await logEvent({
        data: {
          acao: "WHATSAPP_EXPORT_OUTBOX",
          observacoes: `Exportação CSV (${rows.length} linhas, página ${page + 1}).`,
        },
      });
    } catch {
      /* best effort */
    }
    toast.success("Exportação concluída.");
  }

  const filtersActive = useMemo(
    () =>
      [statusFilter !== "ALL", !!templateFilter.trim(), publicoFilter !== "ALL", !!search.trim()].filter(Boolean)
        .length,
    [statusFilter, templateFilter, publicoFilter, search],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <div className="grid gap-1">
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              {WA_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Público</Label>
          <Select value={publicoFilter} onValueChange={(v) => { setPublicoFilter(v); setPage(0); }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="COLABORADOR">Colaborador</SelectItem>
              <SelectItem value="RH">RH</SelectItem>
              <SelectItem value="SUPERVISOR">Supervisor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Template contém</Label>
          <Input
            value={templateFilter}
            onChange={(e) => { setTemplateFilter(e.target.value); setPage(0); }}
            placeholder="ATESTADO..."
            className="w-48"
          />
        </div>
        <div className="grid gap-1 flex-1 min-w-[220px]">
          <Label className="text-xs">Buscar (protocolo, evento, provider id)</Label>
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Buscar…" />
        </div>
        <div className="flex items-center gap-2 pb-1 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          {filtersActive} filtro(s) ativo(s)
        </div>
        <Button variant="outline" size="sm" onClick={() => q.refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
        </Button>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
          <Download className="mr-2 h-4 w-4" /> Exportar CSV
        </Button>
      </div>

      {q.error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <div className="mb-2">Erro ao carregar Outbox: {(q.error as Error).message}</div>
          <Button size="sm" variant="outline" onClick={() => q.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
          </Button>
        </div>
      ) : null}

      <div className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Criado</TableHead>
                <TableHead>Público</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Tentativas</TableHead>
                <TableHead>Próxima</TableHead>
                <TableHead>Provider ID</TableHead>
                <TableHead>Worker</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                    Nenhuma mensagem encontrada com os filtros atuais.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                    <TableCell><WhatsappStatusBadge status={r.status} /></TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{fmtDate(r.created_at)}</TableCell>
                    <TableCell className="text-xs">{r.publico}</TableCell>
                    <TableCell className="text-xs font-mono">{r.template_codigo}</TableCell>
                    <TableCell className="text-xs font-mono">{maskPhoneDisplay(r.telefone_mascarado)}</TableCell>
                    <TableCell className="text-xs tabular-nums">{r.tentativas}/{r.max_tentativas}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{fmtDate(r.proxima_tentativa_em)}</TableCell>
                    <TableCell className="max-w-[160px] truncate text-xs">{r.provider_message_id ?? "—"}</TableCell>
                    <TableCell className="max-w-[120px] truncate text-xs">{r.locked_by ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
          <div>
            {q.data?.count ?? 0} registros · página {page + 1} de {totalPages}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              Anterior
            </Button>
            <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Próxima
            </Button>
          </div>
        </div>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>Mensagem #{selected.id.slice(0, 8)}</SheetTitle>
                <SheetDescription>
                  {selected.template_codigo} · {selected.publico} · <WhatsappStatusBadge status={selected.status} />
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 text-xs">
                  <div><div className="text-muted-foreground">Criado</div><div>{fmtDate(selected.created_at)}</div></div>
                  <div><div className="text-muted-foreground">Processado</div><div>{fmtDate(selected.processado_em)}</div></div>
                  <div><div className="text-muted-foreground">Enviado</div><div>{fmtDate(selected.enviado_em)}</div></div>
                  <div><div className="text-muted-foreground">Confirmado</div><div>{fmtDate(selected.confirmado_em)}</div></div>
                  <div><div className="text-muted-foreground">Telefone</div><div className="font-mono">{maskPhoneDisplay(selected.telefone_mascarado)}</div></div>
                  <div><div className="text-muted-foreground">Tentativas</div><div>{selected.tentativas}/{selected.max_tentativas}</div></div>
                  <div className="col-span-2"><div className="text-muted-foreground">Provider ID</div><div className="font-mono break-all">{selected.provider_message_id ?? "—"}</div></div>
                  {selected.ultimo_erro_codigo ? (
                    <div className="col-span-2">
                      <div className="text-muted-foreground">Último erro</div>
                      <div className="font-mono text-xs">{selected.ultimo_erro_codigo}: {selected.ultimo_erro_resumido ?? ""}</div>
                    </div>
                  ) : null}
                </div>
                <div>
                  <div className="mb-2 text-sm font-medium">Timeline</div>
                  {timelineQ.isLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : (
                    <WhatsappTimeline events={timelineQ.data ?? []} />
                  )}
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
