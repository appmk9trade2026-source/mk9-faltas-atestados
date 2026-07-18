import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Archive, Bell, CheckCheck, ExternalLink, RefreshCw, ShieldAlert, Timer, Inbox, Filter,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSession } from "@/hooks/use-session";
import {
  useNotificacoes, useMarcarLida, useArquivar,
  type NotifStatus, type NotifSeveridade,
} from "@/hooks/use-notificacoes";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AutomacaoStatusCards, MotorControls, HistoricoExecucoes } from "@/components/automacao/automacao-motor";
import { PreferenciasTab } from "@/components/notificacoes/preferencias-tab";
import { SimuladorTab } from "@/components/notificacoes/simulador-tab";


export const Route = createFileRoute("/_authenticated/notificacoes")({
  head: () => ({ meta: [{ title: "Notificações · CRM MK9" }] }),
  component: NotificacoesPage,
});

const sevBadge: Record<NotifSeveridade, string> = {
  INFO: "bg-muted text-foreground",
  ATENCAO: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  ALTA: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  CRITICA: "bg-destructive/15 text-destructive border-destructive/30",
};

function NotificacoesPage() {
  const { roles, loading } = useSession();
  const isAdmin = roles.includes("super_admin");

  const [status, setStatus] = useState<NotifStatus | "all">("NAO_LIDA");
  const [sev, setSev] = useState<NotifSeveridade | "all">("all");
  const [busca, setBusca] = useState("");

  const { data: items = [], isLoading, refetch } = useNotificacoes(
    status === "all" ? undefined : status,
    100,
  );

  const marcar = useMarcarLida();
  const arquivar = useArquivar();
  

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return items.filter((n) =>
      (sev === "all" || n.severidade === sev) &&
      (!q || n.titulo.toLowerCase().includes(q) || n.mensagem.toLowerCase().includes(q))
    );
  }, [items, sev, busca]);

  const kpi = useMemo(() => {
    const naoLidas = items.filter((i) => i.status === "NAO_LIDA").length;
    const criticas = items.filter((i) => i.severidade === "CRITICA").length;
    const slaVencido = items.filter((i) => i.tipo === "SLA_VENCIDO").length;
    const validacao = items.filter((i) => i.tipo === "VALIDACAO_PENDENTE").length;
    const arquivadas = items.filter((i) => i.status === "ARQUIVADA").length;
    return { naoLidas, criticas, slaVencido, validacao, arquivadas };
  }, [items]);

  const navigate = useNavigate();

  async function marcarTodas() {
    const ids = filtered.filter((i) => i.status === "NAO_LIDA").map((i) => i.id);
    for (const id of ids) await marcar.mutateAsync(id).catch(() => {});
    toast.success(`${ids.length} notificações marcadas como lidas.`);
  }

  if (loading) {
    return <AppShell title="Notificações" breadcrumb={["Sistema", "Notificações"]}><Skeleton className="h-40 w-full" /></AppShell>;
  }

  return (
    <AppShell title="Notificações" breadcrumb={["Sistema", "Notificações"]}>
      <div className="grid gap-3 md:grid-cols-5">
        <KpiCard label="Não lidas" value={kpi.naoLidas} icon={<Inbox className="h-4 w-4" />} />
        <KpiCard label="Críticas" value={kpi.criticas} tone="destructive" icon={<ShieldAlert className="h-4 w-4" />} />
        <KpiCard label="SLA vencido" value={kpi.slaVencido} tone="warning" icon={<Timer className="h-4 w-4" />} />
        <KpiCard label="Validação pendente" value={kpi.validacao} icon={<CheckCheck className="h-4 w-4" />} />
        <KpiCard label="Arquivadas" value={kpi.arquivadas} icon={<Archive className="h-4 w-4" />} />
      </div>

      <Tabs defaultValue="caixa">
        <TabsList>
          <TabsTrigger value="caixa"><Bell className="mr-1.5 h-3.5 w-3.5" />Caixa de entrada</TabsTrigger>
          <TabsTrigger value="preferencias">Preferências</TabsTrigger>
          <TabsTrigger value="regras">Regras de escalonamento</TabsTrigger>
          {(isAdmin || roles.includes("compliance")) && <TabsTrigger value="simulador">Simulador</TabsTrigger>}
          {isAdmin && <TabsTrigger value="motor">Motor de SLA</TabsTrigger>}
        </TabsList>

        <TabsContent value="caixa" className="space-y-3">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-2 pt-6">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={status} onValueChange={(v) => setStatus(v as NotifStatus | "all")}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="NAO_LIDA">Não lidas</SelectItem>
                  <SelectItem value="LIDA">Lidas</SelectItem>
                  <SelectItem value="ARQUIVADA">Arquivadas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sev} onValueChange={(v) => setSev(v as NotifSeveridade | "all")}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Severidade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas severidades</SelectItem>
                  <SelectItem value="CRITICA">Crítica</SelectItem>
                  <SelectItem value="ALTA">Alta</SelectItem>
                  <SelectItem value="ATENCAO">Atenção</SelectItem>
                  <SelectItem value="INFO">Info</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Buscar…" className="w-64" value={busca} onChange={(e) => setBusca(e.target.value)} />
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Atualizar</Button>
                <Button size="sm" onClick={marcarTodas} disabled={marcar.isPending}>
                  <CheckCheck className="mr-1.5 h-3.5 w-3.5" />Marcar todas como lidas
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6"><Skeleton className="h-40 w-full" /></div>
              ) : filtered.length === 0 ? (
                <div className="p-12 text-center">
                  <Inbox className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Nenhuma notificação para os filtros atuais.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Sev.</TableHead>
                      <TableHead>Notificação</TableHead>
                      <TableHead className="w-40">Origem</TableHead>
                      <TableHead className="w-44">Data/hora</TableHead>
                      <TableHead className="w-40 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((n) => (
                      <TableRow key={n.id} className={cn(n.status === "NAO_LIDA" && "bg-primary/5")}>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[10px]", sevBadge[n.severidade])}>
                            {n.severidade}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className={cn("text-sm", n.status === "NAO_LIDA" && "font-medium")}>{n.titulo}</div>
                          <div className="text-xs text-muted-foreground line-clamp-2">{n.mensagem}</div>
                          <div className="mt-1 text-[10px] text-muted-foreground">{n.tipo}</div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{n.origem}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(n.created_at).toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {n.rota_destino && (
                              <Button size="icon" variant="ghost" onClick={() => navigate({ to: n.rota_destino! })} title="Abrir">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {n.status !== "LIDA" && (
                              <Button size="icon" variant="ghost" onClick={() => marcar.mutate(n.id)} title="Marcar como lida">
                                <CheckCheck className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {n.status !== "ARQUIVADA" && (
                              <Button size="icon" variant="ghost" onClick={() => arquivar.mutate(n.id)} title="Arquivar">
                                <Archive className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="regras">
          <RegrasEscalonamento canEdit={isAdmin} />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="motor" className="space-y-3">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div>
                  <h3 className="text-base font-semibold">Motor de SLA e escalonamento</h3>
                  <p className="text-xs text-muted-foreground">
                    Executado automaticamente pelo backend. Ações manuais são idempotentes e ficam registradas em auditoria.
                  </p>
                </div>
                <AutomacaoStatusCards />
                <div className="border-t pt-4">
                  <MotorControls canWrite={isAdmin} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-3 pt-6">
                <h4 className="text-sm font-semibold">Histórico de execuções</h4>
                <HistoricoExecucoes />
              </CardContent>
            </Card>
          </TabsContent>
        )}

      </Tabs>
    </AppShell>
  );
}

function KpiCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone?: "destructive" | "warning" }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className={cn(
            "text-muted-foreground",
            tone === "destructive" && "text-destructive",
            tone === "warning" && "text-orange-500",
          )}>{icon}</span>
        </div>
        <div className="mt-2 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function RegrasEscalonamento({ canEdit }: { canEdit: boolean }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["regras-escalonamento"],
    queryFn: async () => {
      const { data, error } = await supabase.from("regras_escalonamento").select("*").order("prioridade");
      if (error) throw error;
      return data ?? [];
    },
  });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Regra</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Severidade mín.</TableHead>
              <TableHead>Destino inicial</TableHead>
              <TableHead>Escalona para</TableHead>
              <TableHead>Repetição</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((r: Record<string, unknown>) => (
              <TableRow key={String(r.id)}>
                <TableCell>
                  <div className="text-sm font-medium">{String(r.nome)}</div>
                  <div className="text-xs text-muted-foreground">{String(r.descricao ?? "")}</div>
                </TableCell>
                <TableCell className="text-xs">{String(r.tipo_evento)}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{String(r.severidade_minima)}</Badge></TableCell>
                <TableCell className="text-xs">{String(r.papel_destino_inicial ?? "—")}</TableCell>
                <TableCell className="text-xs">{String(r.papel_destino_escalado ?? "—")}</TableCell>
                <TableCell className="text-xs">
                  {r.repetir_alerta ? `a cada ${String(r.intervalo_repeticao_minutos ?? "?")}min` : "não"}
                </TableCell>
                <TableCell>
                  <Badge variant={r.ativo ? "default" : "secondary"} className="text-[10px]">
                    {r.ativo ? "Ativa" : "Inativa"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!canEdit && (
          <div className="border-t p-3 text-xs text-muted-foreground">
            Somente Super Admin pode editar regras.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UltimasExecucoes() {
  const { data = [] } = useQuery({
    queryKey: ["esc-execs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("escalonamento_execucoes")
        .select("*").order("iniciado_em", { ascending: false }).limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div>
      <h4 className="mb-2 text-sm font-medium">Últimas execuções</h4>
      {data.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma execução registrada.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Início</TableHead>
              <TableHead>Fim</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Processados</TableHead>
              <TableHead>Geradas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((e: Record<string, unknown>) => (
              <TableRow key={String(e.id)}>
                <TableCell className="text-xs">{new Date(String(e.iniciado_em)).toLocaleString("pt-BR")}</TableCell>
                <TableCell className="text-xs">{e.finalizado_em ? new Date(String(e.finalizado_em)).toLocaleString("pt-BR") : "—"}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{String(e.status)}</Badge></TableCell>
                <TableCell className="text-xs">{String(e.processados)}</TableCell>
                <TableCell className="text-xs">{String(e.notificacoes_geradas)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
