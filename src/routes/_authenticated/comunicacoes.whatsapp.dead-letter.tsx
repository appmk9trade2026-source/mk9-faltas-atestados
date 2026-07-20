import { WhatsappRouteError, WhatsappRouteLoading, WhatsappRouteNotFound } from "@/components/whatsapp/route-boundaries";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, RotateCcw, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WhatsappStatusBadge } from "@/components/whatsapp/status-badge";
import { WhatsappTimeline, type TimelineEvent } from "@/components/whatsapp/timeline";
import { fmtDate, maskPhoneDisplay } from "@/lib/whatsapp-format";
import { requeueDeadLetter, logWhatsappAdminEvent } from "@/lib/whatsapp-admin.functions";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/comunicacoes/whatsapp/dead-letter")({
  component: DeadLetterPage,
  errorComponent: ({ error, reset }) => <WhatsappRouteError error={error} reset={reset} />,
  notFoundComponent: () => <WhatsappRouteNotFound />,
  pendingComponent: () => <WhatsappRouteLoading />,
});

type Row = {
  id: string;
  created_at: string;
  falhou_em: string | null;
  publico: string;
  template_codigo: string;
  telefone_mascarado: string;
  tentativas: number;
  max_tentativas: number;
  provider_message_id: string | null;
  ultimo_erro_codigo: string | null;
  ultimo_erro_resumido: string | null;
  status: string;
};

function DeadLetterPage() {
  const { roles } = useSession();
  const isSuper = roles.includes("super_admin");
  const [selected, setSelected] = useState<Row | null>(null);
  const [confirmRequeue, setConfirmRequeue] = useState<Row | null>(null);
  const qc = useQueryClient();
  const requeue = useServerFn(requeueDeadLetter);
  const logEvent = useServerFn(logWhatsappAdminEvent);

  useEffect(() => {
    // Best-effort audit for viewing the Dead Letter page.
    logEvent({ data: { acao: "WHATSAPP_DEAD_LETTER_VISUALIZADA" } }).catch(() => {});
  }, [logEvent]);

  const q = useQuery({
    queryKey: ["wa-dead-letter"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_outbox")
        .select("id, created_at, falhou_em, publico, template_codigo, telefone_mascarado, tentativas, max_tentativas, provider_message_id, ultimo_erro_codigo, ultimo_erro_resumido, status")
        .eq("status", "FALHOU_DEFINITIVO")
        .order("falhou_em", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const timelineQ = useQuery({
    queryKey: ["wa-dl-timeline", selected?.id],
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

  const requeueMut = useMutation({
    mutationFn: (id: string) => requeue({ data: { outboxId: id } }),
    onSuccess: () => {
      toast.success("Mensagem reenfileirada.");
      setConfirmRequeue(null);
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["wa-dead-letter"] });
    },
    onError: (e: unknown) => {
      toast.error("Falha ao reenfileirar: " + ((e as Error)?.message ?? String(e)));
    },
  });

  const rows = q.data ?? [];

  async function exportCsv() {
    const header = ["falhou_em", "template", "publico", "telefone_mascarado", "tentativas", "codigo_erro", "erro_resumido", "provider_message_id"];
    const lines = [header.join(",")];
    for (const r of rows) {
      const cells = [
        r.falhou_em ?? "",
        r.template_codigo,
        r.publico,
        maskPhoneDisplay(r.telefone_mascarado),
        `${r.tentativas}/${r.max_tentativas}`,
        r.ultimo_erro_codigo ?? "",
        r.ultimo_erro_resumido ?? "",
        r.provider_message_id ?? "",
      ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `whatsapp-dead-letter-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    logEvent({ data: { acao: "WHATSAPP_EXPORT_OUTBOX", observacoes: "Exportação Dead Letter CSV." } }).catch(() => {});
    toast.success("Exportação concluída.");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Dead Letter</h2>
          <p className="text-sm text-muted-foreground">
            Mensagens em <code>FALHOU_DEFINITIVO</code> após esgotar as tentativas.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
            <Download className="mr-2 h-4 w-4" /> Exportar CSV
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Falhou em</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Público</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Tentativas</TableHead>
                <TableHead>Erro</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    Sem mensagens em Dead Letter. 🎉
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.falhou_em)}</TableCell>
                    <TableCell className="text-xs font-mono">{r.template_codigo}</TableCell>
                    <TableCell className="text-xs">{r.publico}</TableCell>
                    <TableCell className="text-xs font-mono">{maskPhoneDisplay(r.telefone_mascarado)}</TableCell>
                    <TableCell className="text-xs">{r.tentativas}/{r.max_tentativas}</TableCell>
                    <TableCell className="text-xs">
                      {r.ultimo_erro_codigo ? <code className="font-mono">{r.ultimo_erro_codigo}</code> : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setSelected(r)}>Detalhes</Button>
                        {isSuper ? (
                          <Button size="sm" onClick={() => setConfirmRequeue(r)}>
                            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reenfileirar
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>Dead Letter #{selected.id.slice(0, 8)}</SheetTitle>
                <SheetDescription>
                  {selected.template_codigo} · <WhatsappStatusBadge status={selected.status} />
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 text-xs">
                  <div><div className="text-muted-foreground">Criado</div><div>{fmtDate(selected.created_at)}</div></div>
                  <div><div className="text-muted-foreground">Falhou</div><div>{fmtDate(selected.falhou_em)}</div></div>
                  <div><div className="text-muted-foreground">Telefone</div><div className="font-mono">{maskPhoneDisplay(selected.telefone_mascarado)}</div></div>
                  <div><div className="text-muted-foreground">Tentativas</div><div>{selected.tentativas}/{selected.max_tentativas}</div></div>
                  <div className="col-span-2"><div className="text-muted-foreground">Provider ID</div><div className="font-mono break-all">{selected.provider_message_id ?? "—"}</div></div>
                  <div className="col-span-2">
                    <div className="text-muted-foreground">Último erro</div>
                    <div className="font-mono text-xs">
                      {selected.ultimo_erro_codigo ?? "—"}
                      {selected.ultimo_erro_resumido ? `: ${selected.ultimo_erro_resumido}` : ""}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-sm font-medium">Timeline</div>
                  {timelineQ.isLoading ? <Skeleton className="h-24 w-full" /> : <WhatsappTimeline events={timelineQ.data ?? []} />}
                </div>
                {isSuper ? (
                  <Button className="w-full" onClick={() => setConfirmRequeue(selected)}>
                    <RotateCcw className="mr-2 h-4 w-4" /> Reenfileirar mensagem
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!confirmRequeue} onOpenChange={(o) => !o && setConfirmRequeue(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reenfileirar mensagem?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação move a mensagem de volta para <code>PENDENTE</code>, zera as tentativas e registra
              um evento append-only. Uma entrada será criada em <code>audit_logs</code>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={requeueMut.isPending}
              onClick={() => confirmRequeue && requeueMut.mutate(confirmRequeue.id)}
            >
              {requeueMut.isPending ? "Reenfileirando…" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
