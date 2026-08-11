import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, XCircle, Clock, PlayCircle, MinusCircle, Rocket,
  FileDown, Search, Plus, Loader2, ShieldCheck, LifeBuoy,
} from "lucide-react";
import jsPDF from "jspdf";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/homologacao")({
  head: () => ({ meta: [{ title: "Homologação · CRM MK9" }] }),
  component: HomologPage,
});

type Status = "PENDENTE" | "EM_EXECUCAO" | "APROVADO" | "REPROVADO" | "NAO_APLICAVEL";
type Criticidade = "BAIXA" | "MEDIA" | "ALTA" | "CRITICA";
type Classificacao = "BUG" | "MELHORIA" | "DUVIDA" | "CONFIGURACAO";

type Cenario = {
  id: string;
  modulo: string;
  nome: string;
  descricao: string | null;
  responsavel: string | null;
  status: Status;
  criticidade: Criticidade;
  classificacao: Classificacao | null;
  evidencia: string | null;
  evidencia_url: string | null;
  resultado: string | null;
  observacoes: string | null;
  executado_em: string | null;
  aprovado_em: string | null;
  updated_at: string;
};

type GoLive = {
  id: string;
  categoria: string;
  item: string;
  ordem: number;
  concluido: boolean;
  observacoes: string | null;
  concluido_em: string | null;
};

type OpAssist = {
  id: string;
  ocorrencia: string;
  descricao: string | null;
  prioridade: "BAIXA" | "MEDIA" | "ALTA" | "CRITICA";
  responsavel: string | null;
  situacao: "ABERTO" | "EM_ANDAMENTO" | "RESOLVIDO" | "CANCELADO";
  resolucao: string | null;
  aberto_em: string;
  resolvido_em: string | null;
};

const STATUS_META: Record<Status, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  PENDENTE: { label: "Pendente", color: "bg-muted text-muted-foreground", icon: Clock },
  EM_EXECUCAO: { label: "Em execução", color: "bg-blue-500/15 text-blue-700 dark:text-blue-300", icon: PlayCircle },
  APROVADO: { label: "Aprovado", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", icon: CheckCircle2 },
  REPROVADO: { label: "Reprovado", color: "bg-red-500/15 text-red-700 dark:text-red-300", icon: XCircle },
  NAO_APLICAVEL: { label: "N/A", color: "bg-muted text-muted-foreground", icon: MinusCircle },
};

const CRIT_META: Record<Criticidade, string> = {
  BAIXA: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  MEDIA: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ALTA: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  CRITICA: "bg-red-500/15 text-red-700 dark:text-red-300",
};

function HomologPage() {
  const { roles, loading } = useSession();

  if (loading) {
    return (
      <AppShell title="Homologação" breadcrumb={["Sistema", "Homologação"]}>
        <Skeleton className="h-40 w-full" />
      </AppShell>
    );
  }

  const canView = roles.includes("super_admin") || roles.includes("compliance") || roles.includes("rh");
  if (!canView) return <Navigate to="/dashboard" replace />;

  const canEdit = roles.includes("super_admin") || roles.includes("compliance");

  return (
    <AppShell title="Centro de Homologação" breadcrumb={["Sistema", "Homologação"]}>
      <p className="-mt-4 text-sm text-muted-foreground">
        Homologação (UAT), critérios de Go-Live e Operação Assistida do CRM MK9.
      </p>

      <Tabs defaultValue="cenarios" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="cenarios"><ShieldCheck className="mr-2 h-4 w-4" />Cenários</TabsTrigger>
          <TabsTrigger value="ambev_manual"><CheckCircle2 className="mr-2 h-4 w-4" />Homologação AMBEV</TabsTrigger>
          <TabsTrigger value="golive"><Rocket className="mr-2 h-4 w-4" />Go-Live</TabsTrigger>
          <TabsTrigger value="opassist"><LifeBuoy className="mr-2 h-4 w-4" />Operação Assistida</TabsTrigger>
        </TabsList>

        <TabsContent value="cenarios"><CenariosTab canEdit={canEdit} /></TabsContent>
        <TabsContent value="ambev_manual"><HomologacaoAmbevManualTab /></TabsContent>
        <TabsContent value="golive"><GoLiveTab canEdit={canEdit} /></TabsContent>
        <TabsContent value="opassist"><OpAssistTab canEdit={canEdit} /></TabsContent>
      </Tabs>
    </AppShell>
  );
}

// ============ CENÁRIOS ============
function CenariosTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterModulo, setFilterModulo] = useState<string>("all");
  const [filterCrit, setFilterCrit] = useState<string>("all");
  const [busca, setBusca] = useState("");
  const [selected, setSelected] = useState<Cenario | null>(null);
  const [openNew, setOpenNew] = useState(false);

  const kpisQ = useQuery({
    queryKey: ["homolog-kpis"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("homolog_kpis" as never);
      if (error) throw error;
      return data as {
        total: number; executados: number; aprovados: number;
        reprovados: number; pendentes: number; nao_aplicavel: number;
        criticos_reprovados: number;
      };
    },
  });

  const listQ = useQuery({
    queryKey: ["homolog-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("homologacoes" as never)
        .select("*")
        .order("modulo", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Cenario[];
    },
  });

  const modulos = useMemo(() => {
    const set = new Set<string>();
    (listQ.data ?? []).forEach((c) => set.add(c.modulo));
    return Array.from(set).sort();
  }, [listQ.data]);

  const rows = useMemo(() => {
    return (listQ.data ?? []).filter((c) => {
      if (filterStatus !== "all" && c.status !== filterStatus) return false;
      if (filterModulo !== "all" && c.modulo !== filterModulo) return false;
      if (filterCrit !== "all" && c.criticidade !== filterCrit) return false;
      if (busca && !`${c.nome} ${c.modulo} ${c.responsavel ?? ""}`.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    });
  }, [listQ.data, filterStatus, filterModulo, filterCrit, busca]);

  const kpis = kpisQ.data;
  const pct = kpis && kpis.total > 0 ? Math.round((kpis.aprovados / kpis.total) * 100) : 0;

  async function gerarPdf() {
    const doc = new jsPDF();
    const now = new Date().toLocaleString("pt-BR");
    const list = listQ.data ?? [];
    doc.setFontSize(16); doc.text("CRM MK9 — Relatório de Homologação", 14, 18);
    doc.setFontSize(10);
    doc.text(`Emitido em: ${now}`, 14, 26);
    if (kpis) {
      doc.text(`Total: ${kpis.total}  |  Aprovados: ${kpis.aprovados}  |  Reprovados: ${kpis.reprovados}  |  Pendentes: ${kpis.pendentes}  |  N/A: ${kpis.nao_aplicavel}`, 14, 34);
      doc.text(`Taxa de aprovação: ${pct}%  |  Reprovados críticos: ${kpis.criticos_reprovados}`, 14, 40);
    }
    let y = 50;
    doc.setFontSize(12); doc.text("Cenários", 14, y); y += 6;
    doc.setFontSize(9);
    list.forEach((c) => {
      if (y > 275) { doc.addPage(); y = 20; }
      const line = `[${c.status}] (${c.criticidade}) ${c.modulo} — ${c.nome}`;
      doc.text(line.substring(0, 110), 14, y); y += 5;
      if (c.observacoes) {
        const obs = doc.splitTextToSize(`Obs: ${c.observacoes}`, 180);
        doc.text(obs, 18, y); y += obs.length * 4;
      }
    });
    const pageCount = (doc as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(`Página ${i}/${pageCount} · CRM MK9`, 14, 290);
    }
    doc.save(`homologacao-${new Date().toISOString().slice(0,10)}.pdf`);
    try {
      await supabase.from("audit_logs" as never).insert({
        modulo: "homologacao", entidade: "relatorio",
        acao: "EXPORTACAO" as never, observacoes: `Relatório PDF (${list.length} cenários)`,
        origem: "homologacao", sucesso: true,
      } as never);
    } catch { /* silent */ }
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Total" value={kpis?.total ?? 0} loading={kpisQ.isLoading} />
        <Kpi label="Executados" value={kpis?.executados ?? 0} loading={kpisQ.isLoading} />
        <Kpi label="Aprovados" value={kpis?.aprovados ?? 0} tone="ok" loading={kpisQ.isLoading} />
        <Kpi label="Reprovados" value={kpis?.reprovados ?? 0} tone="bad" loading={kpisQ.isLoading} />
        <Kpi label="Pendentes" value={kpis?.pendentes ?? 0} tone="warn" loading={kpisQ.isLoading} />
        <Kpi label="Aprovação" value={`${pct}%`} tone="ok" loading={kpisQ.isLoading} />
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <Progress value={pct} className="h-2" />
          <p className="text-xs text-muted-foreground">Progresso geral da homologação — {kpis?.aprovados ?? 0} de {kpis?.total ?? 0} cenários aprovados.</p>
        </CardContent>
      </Card>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <Label className="text-xs">Pesquisar</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Cenário, módulo, responsável..." className="pl-8" />
            </div>
          </div>
          <div className="w-40">
            <Label className="text-xs">Status</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(Object.keys(STATUS_META) as Status[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-44">
            <Label className="text-xs">Módulo</Label>
            <Select value={filterModulo} onValueChange={setFilterModulo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {modulos.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-36">
            <Label className="text-xs">Severidade</Label>
            <Select value={filterCrit} onValueChange={setFilterCrit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="BAIXA">Baixa</SelectItem>
                <SelectItem value="MEDIA">Média</SelectItem>
                <SelectItem value="ALTA">Alta</SelectItem>
                <SelectItem value="CRITICA">Crítica</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={gerarPdf}><FileDown className="mr-2 h-4 w-4" />Relatório PDF</Button>
            {canEdit && <Button onClick={() => setOpenNew(true)}><Plus className="mr-2 h-4 w-4" />Novo</Button>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {listQ.isLoading ? (
            <div className="p-6"><Skeleton className="h-64 w-full" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Cenário</TableHead>
                  <TableHead>Severidade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Atualizado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum cenário.</TableCell></TableRow>
                )}
                {rows.map((c) => {
                  const S = STATUS_META[c.status];
                  return (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelected(c)}>
                      <TableCell><Badge variant="outline">{c.modulo}</Badge></TableCell>
                      <TableCell className="font-medium">{c.nome}</TableCell>
                      <TableCell><Badge className={CRIT_META[c.criticidade]} variant="secondary">{c.criticidade}</Badge></TableCell>
                      <TableCell><Badge className={S.color} variant="secondary"><S.icon className="mr-1 h-3 w-3" />{S.label}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.responsavel ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(c.updated_at).toLocaleString("pt-BR")}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CenarioSheet
        cenario={selected}
        canEdit={canEdit}
        onClose={() => setSelected(null)}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["homolog-list"] }); qc.invalidateQueries({ queryKey: ["homolog-kpis"] }); }}
      />
      <NovoCenarioDialog
        open={openNew}
        onClose={() => setOpenNew(false)}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["homolog-list"] }); qc.invalidateQueries({ queryKey: ["homolog-kpis"] }); }}
      />
    </div>
  );
}

function Kpi({ label, value, tone, loading }: { label: string; value: number | string; tone?: "ok" | "bad" | "warn"; loading?: boolean }) {
  const toneCls = tone === "ok" ? "text-emerald-600 dark:text-emerald-400"
    : tone === "bad" ? "text-red-600 dark:text-red-400"
    : tone === "warn" ? "text-amber-600 dark:text-amber-400" : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        {loading ? <Skeleton className="h-8 w-20 mt-1" /> : <div className={`text-2xl font-semibold mt-1 ${toneCls}`}>{value}</div>}
      </CardContent>
    </Card>
  );
}

function CenarioSheet({ cenario, canEdit, onClose, onSaved }: {
  cenario: Cenario | null; canEdit: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Cenario>>({});

  useMemo(() => { setForm(cenario ?? {}); }, [cenario]);

  if (!cenario) return null;

  async function save(patch: Partial<Cenario>) {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      const update: Record<string, unknown> = { ...patch };
      if (patch.status && patch.status !== cenario!.status) {
        update.executado_por = uid;
        update.executado_em = now;
        if (patch.status === "APROVADO") { update.aprovado_por = uid; update.aprovado_em = now; }
      }
      const { error } = await supabase.from("homologacoes" as never).update(update as never).eq("id", cenario!.id);
      if (error) throw error;
      toast.success("Cenário atualizado.");
      onSaved(); onClose();
    } catch (e) {
      toast.error((e as Error).message ?? "Erro ao salvar.");
    } finally { setSaving(false); }
  }

  const readOnly = !canEdit;

  return (
    <Sheet open={!!cenario} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{cenario.modulo} · {cenario.nome}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {cenario.descricao && <p className="text-sm text-muted-foreground">{cenario.descricao}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={form.status ?? cenario.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as Status }))} disabled={readOnly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_META) as Status[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Severidade</Label>
              <Select value={form.criticidade ?? cenario.criticidade} onValueChange={(v) => setForm((f) => ({ ...f, criticidade: v as Criticidade }))} disabled={readOnly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BAIXA">Baixa</SelectItem>
                  <SelectItem value="MEDIA">Média</SelectItem>
                  <SelectItem value="ALTA">Alta</SelectItem>
                  <SelectItem value="CRITICA">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Classificação</Label>
              <Select
                value={form.classificacao ?? cenario.classificacao ?? "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, classificacao: v === "none" ? null : (v as Classificacao) }))}
                disabled={readOnly}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  <SelectItem value="BUG">Bug</SelectItem>
                  <SelectItem value="MELHORIA">Melhoria</SelectItem>
                  <SelectItem value="DUVIDA">Dúvida</SelectItem>
                  <SelectItem value="CONFIGURACAO">Configuração</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Responsável</Label>
              <Input value={form.responsavel ?? cenario.responsavel ?? ""} onChange={(e) => setForm((f) => ({ ...f, responsavel: e.target.value }))} disabled={readOnly} />
            </div>
          </div>

          <div>
            <Label>Evidência (descrição)</Label>
            <Textarea rows={3} value={form.evidencia ?? cenario.evidencia ?? ""} onChange={(e) => setForm((f) => ({ ...f, evidencia: e.target.value }))} disabled={readOnly} />
          </div>
          <div>
            <Label>Evidência (URL da imagem)</Label>
            <Input value={form.evidencia_url ?? cenario.evidencia_url ?? ""} onChange={(e) => setForm((f) => ({ ...f, evidencia_url: e.target.value }))} disabled={readOnly} placeholder="https://..." />
            {(form.evidencia_url ?? cenario.evidencia_url) && (
              <img src={(form.evidencia_url ?? cenario.evidencia_url) as string} alt="Evidência" className="mt-2 max-h-40 rounded border" />
            )}
          </div>
          <div>
            <Label>Resultado observado</Label>
            <Textarea rows={2} value={form.resultado ?? cenario.resultado ?? ""} onChange={(e) => setForm((f) => ({ ...f, resultado: e.target.value }))} disabled={readOnly} />
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea rows={2} value={form.observacoes ?? cenario.observacoes ?? ""} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} disabled={readOnly} />
          </div>

          {!readOnly && (
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={() => save(form)} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NovoCenarioDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [modulo, setModulo] = useState("");
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [criticidade, setCriticidade] = useState<Criticidade>("MEDIA");

  async function save() {
    if (!modulo || !nome) { toast.error("Módulo e nome são obrigatórios."); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("homologacoes" as never).insert({
        modulo, nome, descricao: descricao || null, criticidade,
      } as never);
      if (error) throw error;
      toast.success("Cenário criado.");
      setModulo(""); setNome(""); setDescricao(""); setCriticidade("MEDIA");
      onSaved(); onClose();
    } catch (e) {
      toast.error((e as Error).message ?? "Erro ao criar.");
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo cenário de homologação</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Módulo</Label><Input value={modulo} onChange={(e) => setModulo(e.target.value)} placeholder="Ex.: Ausências" /></div>
          <div><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Upload maior que 10MB é bloqueado" /></div>
          <div><Label>Descrição</Label><Textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
          <div>
            <Label>Severidade</Label>
            <Select value={criticidade} onValueChange={(v) => setCriticidade(v as Criticidade)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BAIXA">Baixa</SelectItem>
                <SelectItem value="MEDIA">Média</SelectItem>
                <SelectItem value="ALTA">Alta</SelectItem>
                <SelectItem value="CRITICA">Crítica</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ GO-LIVE ============
function GoLiveTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["go-live"],
    queryFn: async () => {
      const { data, error } = await supabase.from("go_live_checklist" as never).select("*").order("ordem");
      if (error) throw error;
      return (data ?? []) as unknown as GoLive[];
    },
  });

  async function toggle(row: GoLive, checked: boolean) {
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const patch = {
        concluido: checked,
        concluido_por: checked ? userRes.user?.id : null,
        concluido_em: checked ? new Date().toISOString() : null,
      };
      const { error } = await supabase.from("go_live_checklist" as never).update(patch as never).eq("id", row.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["go-live"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  const items = q.data ?? [];
  const criterios = items.filter((i) => i.categoria === "Critérios");
  const plano = items.filter((i) => i.categoria === "Plano");
  const done = items.filter((i) => i.concluido).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Progresso Go-Live</div>
              <div className="text-xs text-muted-foreground">{done} de {items.length} itens concluídos</div>
            </div>
            <Badge className={pct === 100 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"} variant="secondary">
              {pct}%
            </Badge>
          </div>
          <Progress value={pct} className="h-2" />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <GoLiveGrupo titulo="Critérios de Aceite" items={criterios} onToggle={toggle} canEdit={canEdit} />
        <GoLiveGrupo titulo="Plano de Implantação" items={plano} onToggle={toggle} canEdit={canEdit} />
      </div>
    </div>
  );
}

function GoLiveGrupo({ titulo, items, onToggle, canEdit }: {
  titulo: string; items: GoLive[]; onToggle: (r: GoLive, c: boolean) => void; canEdit: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="mb-3 text-sm font-semibold">{titulo}</h3>
        <div className="space-y-2">
          {items.map((it) => (
            <label key={it.id} className="flex items-start gap-3 rounded-md border p-3 hover:bg-accent/40 cursor-pointer">
              <Checkbox
                checked={it.concluido}
                disabled={!canEdit}
                onCheckedChange={(v) => onToggle(it, !!v)}
              />
              <div className="flex-1">
                <div className={`text-sm ${it.concluido ? "line-through text-muted-foreground" : ""}`}>{it.item}</div>
                {it.concluido_em && (
                  <div className="text-[11px] text-muted-foreground">Concluído em {new Date(it.concluido_em).toLocaleString("pt-BR")}</div>
                )}
              </div>
            </label>
          ))}
          {items.length === 0 && <div className="text-sm text-muted-foreground">Nenhum item.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

// ============ OPERAÇÃO ASSISTIDA ============
function OpAssistTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [selected, setSelected] = useState<OpAssist | null>(null);

  const q = useQuery({
    queryKey: ["op-assist"],
    queryFn: async () => {
      const { data, error } = await supabase.from("operacao_assistida" as never).select("*").order("aberto_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OpAssist[];
    },
  });

  const rows = q.data ?? [];
  const abertos = rows.filter((r) => r.situacao !== "RESOLVIDO" && r.situacao !== "CANCELADO").length;
  const resolvidos = rows.filter((r) => r.situacao === "RESOLVIDO").length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label="Total" value={rows.length} />
        <Kpi label="Em aberto" value={abertos} tone="warn" />
        <Kpi label="Resolvidos" value={resolvidos} tone="ok" />
        <Card><CardContent className="p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Primeiros 30 dias</div>
            <div className="text-sm">Operação assistida ativa</div>
          </div>
          {canEdit && <Button size="sm" onClick={() => setOpenNew(true)}><Plus className="mr-1 h-4 w-4" />Ocorrência</Button>}
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ocorrência</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Aberta em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma ocorrência registrada.</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                  <TableCell className="font-medium">{r.ocorrencia}</TableCell>
                  <TableCell><Badge className={CRIT_META[r.prioridade]} variant="secondary">{r.prioridade}</Badge></TableCell>
                  <TableCell className="text-sm">{r.responsavel ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{r.situacao.replace("_"," ")}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(r.aberto_em).toLocaleString("pt-BR")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <NovaOcorrenciaDialog open={openNew} onClose={() => setOpenNew(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["op-assist"] })} />
      <OcorrenciaSheet row={selected} canEdit={canEdit} onClose={() => setSelected(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ["op-assist"] }); }} />
    </div>
  );
}

function NovaOcorrenciaDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [ocorrencia, setOcorrencia] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prioridade, setPrioridade] = useState<OpAssist["prioridade"]>("MEDIA");
  const [responsavel, setResponsavel] = useState("");

  async function save() {
    if (!ocorrencia) { toast.error("Descreva a ocorrência."); return; }
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from("operacao_assistida" as never).insert({
        ocorrencia, descricao: descricao || null, prioridade,
        responsavel: responsavel || null, aberto_por: userRes.user?.id,
      } as never);
      if (error) throw error;
      toast.success("Ocorrência registrada.");
      setOcorrencia(""); setDescricao(""); setPrioridade("MEDIA"); setResponsavel("");
      onSaved(); onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova ocorrência</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Ocorrência</Label><Input value={ocorrencia} onChange={(e) => setOcorrencia(e.target.value)} /></div>
          <div><Label>Descrição</Label><Textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Prioridade</Label>
              <Select value={prioridade} onValueChange={(v) => setPrioridade(v as OpAssist["prioridade"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BAIXA">Baixa</SelectItem>
                  <SelectItem value="MEDIA">Média</SelectItem>
                  <SelectItem value="ALTA">Alta</SelectItem>
                  <SelectItem value="CRITICA">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Responsável</Label><Input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OcorrenciaSheet({ row, canEdit, onClose, onSaved }: {
  row: OpAssist | null; canEdit: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<OpAssist>>({});
  const [saving, setSaving] = useState(false);
  useMemo(() => { setForm(row ?? {}); }, [row]);
  if (!row) return null;

  async function save() {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = { ...form };
      if (form.situacao === "RESOLVIDO" && row!.situacao !== "RESOLVIDO") {
        patch.resolvido_em = new Date().toISOString();
      }
      const { error } = await supabase.from("operacao_assistida" as never).update(patch as never).eq("id", row!.id);
      if (error) throw error;
      toast.success("Atualizada.");
      onSaved(); onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }

  const readOnly = !canEdit;

  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader><SheetTitle>{row.ocorrencia}</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3">
          <div><Label>Descrição</Label><Textarea rows={3} value={form.descricao ?? row.descricao ?? ""} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} disabled={readOnly} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Prioridade</Label>
              <Select value={form.prioridade ?? row.prioridade} onValueChange={(v) => setForm((f) => ({ ...f, prioridade: v as OpAssist["prioridade"] }))} disabled={readOnly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BAIXA">Baixa</SelectItem>
                  <SelectItem value="MEDIA">Média</SelectItem>
                  <SelectItem value="ALTA">Alta</SelectItem>
                  <SelectItem value="CRITICA">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Situação</Label>
              <Select value={form.situacao ?? row.situacao} onValueChange={(v) => setForm((f) => ({ ...f, situacao: v as OpAssist["situacao"] }))} disabled={readOnly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ABERTO">Aberto</SelectItem>
                  <SelectItem value="EM_ANDAMENTO">Em andamento</SelectItem>
                  <SelectItem value="RESOLVIDO">Resolvido</SelectItem>
                  <SelectItem value="CANCELADO">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Responsável</Label><Input value={form.responsavel ?? row.responsavel ?? ""} onChange={(e) => setForm((f) => ({ ...f, responsavel: e.target.value }))} disabled={readOnly} /></div>
          <div><Label>Resolução</Label><Textarea rows={3} value={form.resolucao ?? row.resolucao ?? ""} onChange={(e) => setForm((f) => ({ ...f, resolucao: e.target.value }))} disabled={readOnly} /></div>
          {row.resolvido_em && <div className="text-xs text-muted-foreground">Resolvido em {new Date(row.resolvido_em).toLocaleString("pt-BR")}</div>}
          {!readOnly && (
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar</Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function HomologacaoAmbevManualTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">CRM MK9 — HOMOLOGAÇÃO FINAL: OCORRÊNCIA DE PONTO AMBEV (MODO MANUAL)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 text-sm max-w-4xl">
        <div className="bg-muted/50 p-4 rounded-lg border space-y-2">
          <div className="flex items-center gap-2 font-bold text-primary">
            <ShieldCheck className="h-4 w-4" />
            MODO: SOMENTE TESTE / AUDITORIA
          </div>
          <p className="text-xs text-muted-foreground uppercase font-semibold">Budget: Zero alterações de código ou banco.</p>
        </div>

        <section className="space-y-4">
          <h3 className="font-bold border-b pb-1">OBJETIVO</h3>
          <p>Validar três cenários críticos: matrícula inexistente, matrícula já existente e matrícula existente com vínculo divergente, comprovando a integridade do cadastro mestre e a obrigatoriedade de evidências.</p>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <CenarioCard
            titulo="TESTE A — FLUXO NORMAL"
            descricao="Projeto AMBEV → Supervisor → Colaborador existente."
            criterios={[
              "colaborador_id: PREENCHIDO",
              "manual_matricula: VAZIO",
              "modo_manual: NÃO"
            ]}
          />
          <CenarioCard
            titulo="TESTE B — MATRÍCULA INEXISTENTE"
            descricao="Selecionar manual e usar matrícula inexistente."
            criterios={[
              "A ocorrência é criada",
              "Cadastro mestre NÃO é criado",
              "modo_manual: SIM"
            ]}
          />
          <CenarioCard
            titulo="TESTE C — MATRÍCULA JÁ EXISTENTE"
            descricao="Tentar lançamento manual com matrícula existente."
            criterios={[
              "NÃO criar duplicidade",
              "Vincular ao existente ou bloquear",
              "COUNT colaboradores inalterado"
            ]}
          />
          <CenarioCard
            titulo="TESTE D — VÍNCULO DIVERGENTE"
            descricao="Matrícula existente vinculada a outro projeto/supervisor."
            criterios={[
              "projeto_id/supervisor_id INALTERADOS no mestre",
              "O fluxo manual NÃO movimenta o cadastro"
            ]}
          />
        </div>

        <section className="space-y-3 pt-4">
          <h3 className="font-bold border-b pb-1">MATRIZ DE SEGURANÇA SERVER-SIDE</h3>
          <div className="grid gap-2 text-xs">
            <div className="flex items-center gap-2 p-2 rounded bg-red-500/5 border border-red-500/10">
              <XCircle className="h-3 w-3 text-red-500" />
              <span>TESTE E — PROJETO NÃO AMBEV: BLOQUEADO</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded bg-red-500/5 border border-red-500/10">
              <XCircle className="h-3 w-3 text-red-500" />
              <span>TESTE F — SUPERVISOR EXTERNO: BLOQUEADO</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded bg-red-500/5 border border-red-500/10">
              <XCircle className="h-3 w-3 text-red-500" />
              <span>TESTE H — EVIDÊNCIA OBRIGATÓRIA: BLOQUEADO SE VAZIO</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded bg-emerald-500/5 border border-emerald-500/10">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              <span>TESTE I — SEM BLUR: SINCRONIZAÇÃO DE FORMULÁRIO OK</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded bg-emerald-500/5 border border-emerald-500/10">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              <span>TESTE J — AUDITORIA: EVENTO OCORRENCIA_PONTO_MANUAL_CRIADA OK</span>
            </div>
          </div>
        </section>

        <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
          <div className="text-xs font-bold text-amber-800 uppercase flex items-center gap-2">
            <Clock className="h-3 w-3" /> Regra de Parada
          </div>
          <p className="text-[11px] text-amber-700 mt-1 italic">
            PARAR imediatamente se ocorrer: criação automática de colaborador mestre, duplicidade de matrícula, alteração silenciosa de projeto/supervisor no mestre ou aceitação de projeto não AMBEV.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function CenarioCard({ titulo, descricao, criterios }: { titulo: string, descricao: string, criterios: string[] }) {
  return (
    <div className="p-3 rounded-lg border bg-card space-y-2">
      <div className="text-xs font-bold text-muted-foreground">{titulo}</div>
      <p className="text-[11px] font-medium leading-tight">{descricao}</p>
      <ul className="text-[10px] space-y-1 text-muted-foreground">
        {criterios.map((c, i) => <li key={i}>• {c}</li>)}
      </ul>
    </div>
  );
}
