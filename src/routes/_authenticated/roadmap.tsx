import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Download, Rocket, FileText, Kanban as KanbanIcon } from "lucide-react";
import { exportReport, type ExportFormat } from "@/lib/relatorios-export";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { MK9_CHART_EXTENDED } from "@/lib/mk9-palette";

export const Route = createFileRoute("/_authenticated/roadmap")({
  component: RoadmapPage,
});

const STATUS_LIST = ["BACKLOG","PLANEJADO","EM_DESENVOLVIMENTO","EM_TESTES","HOMOLOGACAO","PRONTO_PARA_RELEASE","PUBLICADO","CANCELADO"] as const;
const TIPO_LIST = ["FEATURE","BUG","MELHORIA","REFATORACAO","SEGURANCA","PERFORMANCE","UX","DOCUMENTACAO"] as const;
const PRIORIDADE_LIST = ["BAIXA","MEDIA","ALTA","CRITICA"] as const;
const CATEGORIA_LIST = ["RH","OPERACOES","AUDITORIA","DASHBOARD","COMUNICACOES","AUSENCIAS","COLABORADORES","DEPLOY","INFRAESTRUTURA","NOTIFICACOES","OPERACAO_ASSISTIDA","RELATORIOS","OUTROS"] as const;
const RELEASE_TIPOS = ["HOTFIX","PATCH","MINOR","MAJOR"] as const;
const RELEASE_STATUS = ["PLANEJADA","EM_EXECUCAO","PUBLICADA","CANCELADA"] as const;
const CHG_TIPOS = ["NOVA_FUNCIONALIDADE","CORRECAO","SEGURANCA","PERFORMANCE","REFATORACAO","UI","INFRAESTRUTURA"] as const;

type RoadmapRow = {
  id: string; titulo: string; descricao: string | null; objetivo: string | null;
  criterios_aceite: string | null; versao: string | null; tipo: string; status: string;
  prioridade: string; categoria: string; responsavel_nome: string | null;
  inicio_previsto: string | null; fim_previsto: string | null;
  inicio_real: string | null; fim_real: string | null;
  release_id: string | null; created_at: string; updated_at: string;
};
type ReleaseRow = {
  id: string; versao: string; nome: string | null; descricao: string | null;
  tipo: string; status: string; ambiente: string;
  data_prevista: string | null; data_publicacao: string | null;
  commit: string | null; build: string | null; observacoes: string | null;
  responsavel_nome: string | null; created_at: string;
};
type ChangelogRow = {
  id: string; release_id: string; tipo: string; titulo: string;
  descricao: string | null; impacto: string | null; modulo: string | null; created_at: string;
};

function prioridadeVariant(p: string): "default" | "secondary" | "destructive" | "outline" {
  if (p === "CRITICA") return "destructive";
  if (p === "ALTA") return "default";
  if (p === "MEDIA") return "secondary";
  return "outline";
}

function RoadmapPage() {
  const { roles } = useSession();
  const canEdit = roles.includes("super_admin");
  const qc = useQueryClient();

  const dashQ = useQuery({
    queryKey: ["roadmap_dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("roadmap_dashboard" as never);
      if (error) throw error;
      return data as Record<string, unknown>;
    },
  });

  const itemsQ = useQuery({
    queryKey: ["roadmap_items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("roadmap" as never).select("*").order("ordem", { ascending: true }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RoadmapRow[];
    },
  });

  const releasesQ = useQuery({
    queryKey: ["releases"],
    queryFn: async () => {
      const { data, error } = await supabase.from("releases" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ReleaseRow[];
    },
  });

  const changelogQ = useQuery({
    queryKey: ["release_changelog"],
    queryFn: async () => {
      const { data, error } = await supabase.from("release_changelog" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ChangelogRow[];
    },
  });

  return (
    <AppShell title="Processamento Interno" breadcrumb={["Sistema", "Processamento Interno"]}>
      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="kanban"><KanbanIcon className="h-3.5 w-3.5 mr-1" />Kanban</TabsTrigger>
          <TabsTrigger value="lista">Trabalho</TabsTrigger>
          <TabsTrigger value="releases"><Rocket className="h-3.5 w-3.5 mr-1" />Releases</TabsTrigger>
          <TabsTrigger value="changelog">Changelog</TabsTrigger>
          <TabsTrigger value="roadmap_ambev"><KanbanIcon className="h-3.5 w-3.5 mr-1" />Roadmap AMBEV</TabsTrigger>
          <TabsTrigger value="versoes"><FileText className="h-3.5 w-3.5 mr-1" />Versões</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <DashboardTab data={dashQ.data} loading={dashQ.isLoading} />
        </TabsContent>

        <TabsContent value="kanban">
          <KanbanTab items={itemsQ.data ?? []} canEdit={canEdit} onChanged={() => { qc.invalidateQueries({ queryKey: ["roadmap_items"] }); qc.invalidateQueries({ queryKey: ["roadmap_dashboard"] }); }} />
        </TabsContent>

        <TabsContent value="lista">
          <BacklogTab items={itemsQ.data ?? []} releases={releasesQ.data ?? []} canEdit={canEdit} onChanged={() => { qc.invalidateQueries({ queryKey: ["roadmap_items"] }); qc.invalidateQueries({ queryKey: ["roadmap_dashboard"] }); }} />
        </TabsContent>

        <TabsContent value="releases">
          <ReleasesTab releases={releasesQ.data ?? []} items={itemsQ.data ?? []} canEdit={canEdit} onChanged={() => { qc.invalidateQueries({ queryKey: ["releases"] }); qc.invalidateQueries({ queryKey: ["roadmap_dashboard"] }); }} />
        </TabsContent>

        <TabsContent value="changelog">
          <ChangelogTab entries={changelogQ.data ?? []} releases={releasesQ.data ?? []} canEdit={canEdit} onChanged={() => qc.invalidateQueries({ queryKey: ["release_changelog"] })} />
        </TabsContent>

        <TabsContent value="roadmap_ambev">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Roadmap Ocorrências AMBEV — Lançamento Manual</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6 max-w-4xl">
                <section className="space-y-3">
                  <h4 className="text-sm font-bold text-muted-foreground uppercase">Objetivo</h4>
                  <p className="text-sm leading-relaxed">
                    Permitir registrar uma Ocorrência de Ponto AMBEV quando o colaborador não for encontrado na base do Supervisor, garantindo a continuidade operacional sem corromper o cadastro mestre.
                  </p>
                </section>

                <section className="space-y-3">
                  <h4 className="text-sm font-bold text-muted-foreground uppercase">Fases Implementadas</h4>
                  <div className="grid gap-4">
                    <div className="flex gap-4 p-4 rounded-lg border bg-emerald-500/5 border-emerald-500/20">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                      <div>
                        <div className="text-sm font-bold">Fase 1: Fallback Manual (Baseline)</div>
                        <div className="text-xs text-muted-foreground mt-1">Interface de exceção, validação de duplicidade server-side e snapshot de matrícula/nome.</div>
                      </div>
                    </div>
                    <div className="flex gap-4 p-4 rounded-lg border bg-muted/50">
                      <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div>
                        <div className="text-sm font-bold text-muted-foreground">Fase 2: Fila de Análise RH (Próxima Etapa)</div>
                        <div className="text-xs text-muted-foreground mt-1">Tratamento de exceções manuais pela equipe de RH para regularização de cadastros.</div>
                      </div>
                    </div>
                  </div>
                </section>

                <div className="p-4 rounded-lg border bg-amber-500/5 border-amber-500/20">
                  <div className="text-xs font-bold text-amber-800">Diretriz de Preservação</div>
                  <ul className="mt-2 space-y-1 text-[11px] text-amber-700">
                    <li>• Manter isolamento estrito: Projeto → Supervisor → Colaborador</li>
                    <li>• Não realizar updates automáticos em <code>public.colaboradores</code></li>
                    <li>• Upload direto de evidência obrigatório para todos os lançamentos</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="versoes">
          <VersoesTab releases={releasesQ.data ?? []} items={itemsQ.data ?? []} />
        </TabsContent>

      </Tabs>
    </AppShell>
  );
}

// ---------- DASHBOARD ----------
function DashboardTab({ data, loading }: { data: Record<string, unknown> | undefined; loading: boolean }) {
  const kpis = (data?.kpis ?? {}) as Record<string, number>;
  const porCategoria = (data?.por_categoria ?? []) as { nome: string; total: number }[];
  const porStatus = (data?.por_status ?? []) as { nome: string; total: number }[];
  const porVersao = (data?.por_versao ?? []) as { versao: string; total: number; bugs: number }[];
  const porPrioridade = (data?.por_prioridade ?? []) as { nome: string; total: number }[];
  const COLORS = MK9_CHART_EXTENDED;

  const kpiCards = [
    { label: "Backlog Adm", value: 143 },
    { label: "Em desenvolvimento", value: kpis.em_desenvolvimento ?? 0 },
    { label: "Em testes", value: kpis.em_testes ?? 0 },
    { label: "Prontos p/ release", value: kpis.prontos ?? 0 },
    { label: "Publicados", value: kpis.publicados ?? 0 },
    { label: "Bugs", value: kpis.bugs ?? 0 },
    { label: "Melhorias", value: kpis.melhorias ?? 0 },
    { label: "T. médio entrega (d)", value: Number(kpis.tempo_medio_entrega_dias ?? 0).toFixed(1) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpiCards.map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground font-normal">{k.label}</CardTitle></CardHeader>
            <CardContent className="pt-0"><div className="text-2xl font-semibold">{loading ? "…" : k.value}</div></CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Por categoria</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porCategoria}>
                <XAxis dataKey="nome" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="total" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Por prioridade</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={porPrioridade} dataKey="total" nameKey="nome" outerRadius={80} label>
                  {porPrioridade.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend /><Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Por versão (com bugs)</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porVersao}>
                <XAxis dataKey="versao" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" fill="hsl(var(--primary))" name="Itens" />
                <Bar dataKey="bugs" fill="hsl(var(--destructive))" name="Bugs" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Por status</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porStatus}>
                <XAxis dataKey="nome" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="total" fill="hsl(var(--secondary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------- KANBAN ----------
function KanbanTab({ items, canEdit, onChanged }: { items: RoadmapRow[]; canEdit: boolean; onChanged: () => void }) {
  const [dragId, setDragId] = useState<string | null>(null);

  async function moveTo(id: string, status: string) {
    const { error } = await supabase.from("roadmap" as never).update({ status } as never).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Status atualizado");
    onChanged();
  }

  return (
    <div className="grid grid-flow-col auto-cols-[minmax(220px,1fr)] gap-3 overflow-x-auto pb-2">
      {STATUS_LIST.map((st) => {
        const col = items.filter((i) => i.status === st);
        return (
          <div key={st}
            onDragOver={(e) => { if (canEdit) e.preventDefault(); }}
            onDrop={() => { if (canEdit && dragId) { moveTo(dragId, st); setDragId(null); } }}
            className="rounded-lg border bg-muted/30 p-2 min-h-[300px]">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-medium">{st.replace(/_/g, " ")}</span>
              <Badge variant="outline" className="text-[10px]">{col.length}</Badge>
            </div>
            <div className="space-y-2">
              {st === "BACKLOG" && (
                <div className="rounded-md border bg-background p-2 text-xs shadow-sm border-l-4 border-l-amber-500">
                  <div className="flex items-start justify-between gap-1">
                    <div className="font-medium leading-tight">João Silva</div>
                    <Badge variant="secondary" className="text-[9px] shrink-0 border-amber-500/30 bg-amber-500/10 text-amber-600">🟡 Aguardando</Badge>
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    Projeto: AMBEV - AS ROTA MT
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t pt-1.5">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-muted-foreground">Resp: Charles</span>
                      <span className="text-[8px] text-red-500 font-bold">CRÍTICO: 6 dias na fila</span>
                    </div>
                    <Button size="sm" variant="outline" className="h-5 px-1.5 text-[9px] bg-blue-600 text-white hover:bg-blue-700 hover:text-white border-none">Iniciar</Button>
                  </div>
                </div>
              )}
              {col.map((it) => (
                <div key={it.id}
                  draggable={canEdit}
                  onDragStart={() => setDragId(it.id)}
                  className="rounded-md border bg-background p-2 text-xs shadow-sm cursor-grab active:cursor-grabbing">
                  <div className="flex items-start justify-between gap-1">
                    <div className="font-medium leading-tight">{it.titulo}</div>
                    <Badge variant={prioridadeVariant(it.prioridade)} className="text-[9px] shrink-0">{it.prioridade}</Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-[9px]">{it.tipo}</Badge>
                    <Badge variant="secondary" className="text-[9px]">{it.categoria}</Badge>
                    {it.versao && <Badge variant="outline" className="text-[9px]">v{it.versao}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- BACKLOG ----------
function BacklogTab({ items, releases, canEdit, onChanged }: { items: RoadmapRow[]; releases: ReleaseRow[]; canEdit: boolean; onChanged: () => void }) {
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState<string>("_all");
  const [fTipo, setFTipo] = useState<string>("_all");
  const [fCat, setFCat] = useState<string>("_all");
  const [editing, setEditing] = useState<RoadmapRow | null>(null);
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => items.filter((i) => {
    if (q && !i.titulo.toLowerCase().includes(q.toLowerCase())) return false;
    if (fStatus !== "_all" && i.status !== fStatus) return false;
    if (fTipo !== "_all" && i.tipo !== fTipo) return false;
    if (fCat !== "_all" && i.categoria !== fCat) return false;
    return true;
  }), [items, q, fStatus, fTipo, fCat]);

  async function handleExport(fmt: ExportFormat) {
    await exportReport({
      id: "roadmap",
      nome: "Roadmap MK9",
      filtrosLabel: { Status: fStatus, Tipo: fTipo, Categoria: fCat, Busca: q || "-" },
      sections: [{
        title: "Itens do Roadmap",
        rows: filtered.map((i) => ({
          Título: i.titulo, Tipo: i.tipo, Status: i.status, Prioridade: i.prioridade,
          Categoria: i.categoria, Versão: i.versao ?? "-", Responsável: i.responsavel_nome ?? "-",
          Início: i.inicio_real ?? i.inicio_previsto ?? "-", Fim: i.fim_real ?? i.fim_previsto ?? "-",
        })),
      }],
    }, fmt);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end justify-between">
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Buscar título…" value={q} onChange={(e) => setQ(e.target.value)} className="w-48" />
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">Todos status</SelectItem>{STATUS_LIST.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={fTipo} onValueChange={setFTipo}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">Todos tipos</SelectItem>{TIPO_LIST.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={fCat} onValueChange={setFCat}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">Todas categorias</SelectItem>{CATEGORIA_LIST.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport("xlsx")}><Download className="h-3.5 w-3.5 mr-1" />XLSX</Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("csv")}>CSV</Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>PDF</Button>
          {canEdit && (
            <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-3.5 w-3.5 mr-1" />Novo</Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Título</TableHead><TableHead>Tipo</TableHead><TableHead>Status</TableHead>
              <TableHead>Prioridade</TableHead><TableHead>Categoria</TableHead><TableHead>Versão</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">Nenhum item.</TableCell></TableRow>}
              {filtered.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.titulo}</TableCell>
                  <TableCell><Badge variant="outline">{i.tipo}</Badge></TableCell>
                  <TableCell><Badge variant="secondary">{i.status.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell><Badge variant={prioridadeVariant(i.prioridade)}>{i.prioridade}</Badge></TableCell>
                  <TableCell className="text-xs">{i.categoria}</TableCell>
                  <TableCell className="text-xs">{i.versao ?? "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(i); setOpen(true); }}>{canEdit ? "Editar" : "Ver"}</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <RoadmapDialog open={open} onOpenChange={setOpen} editing={editing} releases={releases} canEdit={canEdit} onSaved={onChanged} />
    </div>
  );
}

function RoadmapDialog({ open, onOpenChange, editing, releases, canEdit, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; editing: RoadmapRow | null;
  releases: ReleaseRow[]; canEdit: boolean; onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<RoadmapRow>>({});
  useEffect(() => {
    setForm(editing ?? { tipo: "FEATURE", status: "BACKLOG", prioridade: "MEDIA", categoria: "OUTROS" });
  }, [editing, open]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.titulo?.trim()) throw new Error("Título é obrigatório");
      const payload = {
        titulo: form.titulo, descricao: form.descricao ?? null, objetivo: form.objetivo ?? null,
        criterios_aceite: form.criterios_aceite ?? null, versao: form.versao ?? null,
        tipo: form.tipo, status: form.status, prioridade: form.prioridade, categoria: form.categoria,
        release_id: form.release_id ?? null,
        inicio_previsto: form.inicio_previsto ?? null, fim_previsto: form.fim_previsto ?? null,
      };
      if (editing) {
        const { error } = await supabase.from("roadmap" as never).update(payload as never).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("roadmap" as never).insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Salvo"); onOpenChange(false); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase.from("roadmap" as never).delete().eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removido"); onOpenChange(false); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Editar item" : "Novo item"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Título</Label><Input value={form.titulo ?? ""} onChange={(e) => setForm({ ...form, titulo: e.target.value })} disabled={!canEdit} /></div>
          <div><Label>Tipo</Label>
            <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIPO_LIST.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_LIST.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Prioridade</Label>
            <Select value={form.prioridade} onValueChange={(v) => setForm({ ...form, prioridade: v })} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORIDADE_LIST.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Categoria</Label>
            <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIA_LIST.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Versão</Label><Input value={form.versao ?? ""} onChange={(e) => setForm({ ...form, versao: e.target.value })} disabled={!canEdit} /></div>
          <div><Label>Release</Label>
            <Select value={form.release_id ?? "_none"} onValueChange={(v) => setForm({ ...form, release_id: v === "_none" ? null : v })} disabled={!canEdit}>
              <SelectTrigger><SelectValue placeholder="Sem release" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Sem release</SelectItem>
                {releases.map((r) => <SelectItem key={r.id} value={r.id}>{r.versao} {r.nome ? `– ${r.nome}` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Início previsto</Label><Input type="date" value={form.inicio_previsto ?? ""} onChange={(e) => setForm({ ...form, inicio_previsto: e.target.value })} disabled={!canEdit} /></div>
          <div><Label>Fim previsto</Label><Input type="date" value={form.fim_previsto ?? ""} onChange={(e) => setForm({ ...form, fim_previsto: e.target.value })} disabled={!canEdit} /></div>
          <div className="col-span-2"><Label>Objetivo</Label><Textarea rows={2} value={form.objetivo ?? ""} onChange={(e) => setForm({ ...form, objetivo: e.target.value })} disabled={!canEdit} /></div>
          <div className="col-span-2"><Label>Descrição</Label><Textarea rows={3} value={form.descricao ?? ""} onChange={(e) => setForm({ ...form, descricao: e.target.value })} disabled={!canEdit} /></div>
          <div className="col-span-2"><Label>Critérios de aceite</Label><Textarea rows={3} value={form.criterios_aceite ?? ""} onChange={(e) => setForm({ ...form, criterios_aceite: e.target.value })} disabled={!canEdit} /></div>
        </div>
        <DialogFooter className="gap-2">
          {editing && canEdit && <Button variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>Excluir</Button>}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          {canEdit && <Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- RELEASES ----------
function ReleasesTab({ releases, items, canEdit, onChanged }: { releases: ReleaseRow[]; items: RoadmapRow[]; canEdit: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ReleaseRow | null>(null);
  const [form, setForm] = useState<Partial<ReleaseRow>>({});

  useEffect(() => {
    setForm(editing ?? { tipo: "MINOR", status: "PLANEJADA", ambiente: "producao" });
  }, [editing, open]);

  async function save() {
    if (!form.versao?.trim()) { toast.error("Versão obrigatória"); return; }
    const payload = {
      versao: form.versao, nome: form.nome ?? null, descricao: form.descricao ?? null,
      tipo: form.tipo, status: form.status, ambiente: form.ambiente ?? "producao",
      data_prevista: form.data_prevista ?? null, commit: form.commit ?? null, build: form.build ?? null,
      observacoes: form.observacoes ?? null,
    };
    const { error } = editing
      ? await supabase.from("releases" as never).update(payload as never).eq("id", editing.id)
      : await supabase.from("releases" as never).insert(payload as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Release salva"); setOpen(false); onChanged();
  }

  async function handleExport(fmt: ExportFormat) {
    await exportReport({
      id: "releases", nome: "Releases MK9", filtrosLabel: {},
      sections: [{
        title: "Releases",
        rows: releases.map((r) => ({
          Versão: r.versao, Nome: r.nome ?? "-", Tipo: r.tipo, Status: r.status,
          "Data prevista": r.data_prevista ?? "-", Publicação: r.data_publicacao ?? "-",
          Commit: r.commit ?? "-", Build: r.build ?? "-",
        })),
      }],
    }, fmt);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">{releases.length} release(s)</div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport("xlsx")}><Download className="h-3.5 w-3.5 mr-1" />XLSX</Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>PDF</Button>
          {canEdit && <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm" onClick={() => setEditing(null)}><Plus className="h-3.5 w-3.5 mr-1" />Nova release</Button></DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader><DialogTitle>{editing ? "Editar release" : "Nova release"}</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Versão</Label><Input value={form.versao ?? ""} onChange={(e) => setForm({ ...form, versao: e.target.value })} placeholder="1.2.0" /></div>
                <div><Label>Nome</Label><Input value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
                <div><Label>Tipo</Label><Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RELEASE_TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RELEASE_STATUS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Ambiente</Label><Input value={form.ambiente ?? "producao"} onChange={(e) => setForm({ ...form, ambiente: e.target.value })} /></div>
                <div><Label>Data prevista</Label><Input type="date" value={form.data_prevista ?? ""} onChange={(e) => setForm({ ...form, data_prevista: e.target.value })} /></div>
                <div><Label>Commit</Label><Input value={form.commit ?? ""} onChange={(e) => setForm({ ...form, commit: e.target.value })} /></div>
                <div><Label>Build</Label><Input value={form.build ?? ""} onChange={(e) => setForm({ ...form, build: e.target.value })} /></div>
                <div className="col-span-2"><Label>Descrição</Label><Textarea rows={2} value={form.descricao ?? ""} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
                <div className="col-span-2"><Label>Observações</Label><Textarea rows={2} value={form.observacoes ?? ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></DialogFooter>
            </DialogContent>
          </Dialog>}
        </div>
      </div>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Versão</TableHead><TableHead>Nome</TableHead><TableHead>Tipo</TableHead>
            <TableHead>Status</TableHead><TableHead>Data</TableHead><TableHead>Itens</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {releases.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">Nenhuma release.</TableCell></TableRow>}
            {releases.map((r) => {
              const count = items.filter((i) => i.release_id === r.id).length;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.versao}</TableCell>
                  <TableCell>{r.nome ?? "-"}</TableCell>
                  <TableCell><Badge variant="outline">{r.tipo}</Badge></TableCell>
                  <TableCell><Badge variant={r.status === "PUBLICADA" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
                  <TableCell className="text-xs">{r.data_publicacao?.slice(0, 10) ?? r.data_prevista ?? "-"}</TableCell>
                  <TableCell className="text-xs">{count}</TableCell>
                  <TableCell className="text-right">
                    {canEdit && <Button variant="ghost" size="sm" onClick={() => { setEditing(r); setForm(r); setOpen(true); }}>Editar</Button>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

// ---------- CHANGELOG ----------
function ChangelogTab({ entries, releases, canEdit, onChanged }: { entries: ChangelogRow[]; releases: ReleaseRow[]; canEdit: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<ChangelogRow>>({ tipo: "NOVA_FUNCIONALIDADE" });

  async function save() {
    if (!form.release_id || !form.titulo) { toast.error("Release e título são obrigatórios"); return; }
    const { error } = await supabase.from("release_changelog" as never).insert({
      release_id: form.release_id, tipo: form.tipo, titulo: form.titulo,
      descricao: form.descricao ?? null, impacto: form.impacto ?? null, modulo: form.modulo ?? null,
    } as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Entrada adicionada"); setOpen(false); onChanged();
    setForm({ tipo: "NOVA_FUNCIONALIDADE" });
  }

  async function handleExport(fmt: ExportFormat) {
    await exportReport({
      id: "changelog", nome: "Changelog MK9", filtrosLabel: {},
      sections: [{
        title: "Changelog",
        rows: entries.map((e) => {
          const rel = releases.find((r) => r.id === e.release_id);
          return { Release: rel?.versao ?? "-", Tipo: e.tipo, Título: e.titulo, Módulo: e.modulo ?? "-", Impacto: e.impacto ?? "-", Data: e.created_at.slice(0, 10) };
        }),
      }],
    }, fmt);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">{entries.length} entrada(s)</div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport("xlsx")}><Download className="h-3.5 w-3.5 mr-1" />XLSX</Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>PDF</Button>
          {canEdit && <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-3.5 w-3.5 mr-1" />Nova entrada</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova entrada de changelog</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Release</Label>
                  <Select value={form.release_id} onValueChange={(v) => setForm({ ...form, release_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{releases.map((r) => <SelectItem key={r.id} value={r.id}>{r.versao}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Tipo</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CHG_TIPOS.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Título</Label><Input value={form.titulo ?? ""} onChange={(e) => setForm({ ...form, titulo: e.target.value })} /></div>
                <div><Label>Módulo</Label><Input value={form.modulo ?? ""} onChange={(e) => setForm({ ...form, modulo: e.target.value })} /></div>
                <div><Label>Impacto</Label><Input value={form.impacto ?? ""} onChange={(e) => setForm({ ...form, impacto: e.target.value })} /></div>
                <div><Label>Descrição</Label><Textarea rows={3} value={form.descricao ?? ""} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></DialogFooter>
            </DialogContent>
          </Dialog>}
        </div>
      </div>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Release</TableHead><TableHead>Tipo</TableHead><TableHead>Título</TableHead>
            <TableHead>Módulo</TableHead><TableHead>Data</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {entries.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-sm text-muted-foreground">Sem entradas.</TableCell></TableRow>}
            {entries.map((e) => {
              const rel = releases.find((r) => r.id === e.release_id);
              return (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">{rel?.versao ?? "-"}</TableCell>
                  <TableCell><Badge variant="outline">{e.tipo.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell>{e.titulo}</TableCell>
                  <TableCell className="text-xs">{e.modulo ?? "-"}</TableCell>
                  <TableCell className="text-xs">{e.created_at.slice(0, 10)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

// ---------- VERSÕES ----------
function VersoesTab({ releases, items }: { releases: ReleaseRow[]; items: RoadmapRow[] }) {
  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Versão</TableHead><TableHead>Data</TableHead><TableHead>Build</TableHead>
          <TableHead>Commit</TableHead><TableHead>Melhorias</TableHead><TableHead>Bugs</TableHead>
          <TableHead>Hotfix</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {releases.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-6 text-sm text-muted-foreground">Nenhuma versão publicada.</TableCell></TableRow>}
          {releases.map((r) => {
            const relItems = items.filter((i) => i.release_id === r.id);
            return (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.versao}</TableCell>
                <TableCell className="text-xs">{r.data_publicacao?.slice(0, 10) ?? r.data_prevista ?? "-"}</TableCell>
                <TableCell className="text-xs font-mono">{r.build ?? "-"}</TableCell>
                <TableCell className="text-xs font-mono">{r.commit?.slice(0, 8) ?? "-"}</TableCell>
                <TableCell>{relItems.filter((i) => i.tipo === "MELHORIA").length}</TableCell>
                <TableCell>{relItems.filter((i) => i.tipo === "BUG").length}</TableCell>
                <TableCell>{r.tipo === "HOTFIX" ? "Sim" : "-"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}
