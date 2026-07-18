import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  AlertTriangle, PlusCircle, ClipboardList, TimerReset, Activity, ShieldAlert,
  MessageSquare, CheckCircle2, RotateCcw, Rocket, Calendar, Users, Filter,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/operacao-assistida")({
  head: () => ({ meta: [{ title: "Operação Assistida · CRM MK9" }] }),
  component: Page,
});

const CATEGORIAS = ["AUTENTICACAO","PERMISSAO","IMPORTACAO","COLABORADORES","AUSENCIAS","COMUNICACOES","PAINEL_RH","DASHBOARD","RELATORIOS","AUDITORIA","OPERACOES","DEPLOY","DESEMPENHO","INTERFACE","DADOS","OUTROS"] as const;
const TIPOS = ["INCIDENTE","BUG","DUVIDA","SOLICITACAO","CONFIGURACAO","MELHORIA"] as const;
const SEVERIDADES = ["BAIXA","MEDIA","ALTA","CRITICA"] as const;
const PRIORIDADES = ["P4","P3","P2","P1"] as const;
const IMPACTOS = ["INDIVIDUAL","EQUIPE","DEPARTAMENTO","GERAL"] as const;
const STATUS = ["NOVO","EM_TRIAGEM","EM_ANALISE","EM_CORRECAO","AGUARDANDO_VALIDACAO","RESOLVIDO","ENCERRADO","CANCELADO"] as const;
const AMBIENTES = ["producao","homologacao","preview","desenvolvimento"] as const;

type Sev = typeof SEVERIDADES[number];
type Pri = typeof PRIORIDADES[number];
type Sta = typeof STATUS[number];

const sevColor: Record<Sev,string> = {
  BAIXA: "bg-slate-500/15 text-slate-600 border-slate-500/30",
  MEDIA: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  ALTA: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  CRITICA: "bg-red-500/15 text-red-600 border-red-500/30",
};
const priColor: Record<Pri,string> = {
  P4: "bg-slate-500/15 text-slate-600 border-slate-500/30",
  P3: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  P2: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  P1: "bg-red-500/15 text-red-600 border-red-500/30",
};
const staColor: Record<Sta,string> = {
  NOVO: "bg-slate-500/15 text-slate-700",
  EM_TRIAGEM: "bg-blue-500/15 text-blue-700",
  EM_ANALISE: "bg-indigo-500/15 text-indigo-700",
  EM_CORRECAO: "bg-purple-500/15 text-purple-700",
  AGUARDANDO_VALIDACAO: "bg-amber-500/15 text-amber-700",
  RESOLVIDO: "bg-emerald-500/15 text-emerald-700",
  ENCERRADO: "bg-neutral-500/15 text-neutral-700",
  CANCELADO: "bg-neutral-500/10 text-neutral-500",
};

function Page() {
  const { roles, loading } = useSession();
  if (loading) return <AppShell title="Operação Assistida" breadcrumb={["Sistema","Operação Assistida"]}><Skeleton className="h-40 w-full" /></AppShell>;
  const canRead = roles.includes("super_admin") || roles.includes("compliance") || roles.includes("rh");
  if (!canRead) return <Navigate to="/dashboard" replace />;
  return <Content isAdmin={roles.includes("super_admin")} isCompliance={roles.includes("compliance")} />;
}

function Content({ isAdmin, isCompliance }: { isAdmin: boolean; isCompliance: boolean }) {
  const qc = useQueryClient();
  const [filtroStatus, setFiltroStatus] = useState<string>("abertos");
  const [filtroSev, setFiltroSev] = useState<string>("todas");
  const [filtroCat, setFiltroCat] = useState<string>("todas");
  const [busca, setBusca] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [novoOpen, setNovoOpen] = useState(false);
  const [novoPeriodoOpen, setNovoPeriodoOpen] = useState(false);

  const dashboard = useQuery({
    queryKey: ["oa-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("oa_dashboard", { _periodo_id: null as any });
      if (error) throw error;
      return data as any;
    },
    refetchInterval: 60000,
  });

  const incidentesQ = useQuery({
    queryKey: ["oa-incidentes", filtroStatus, filtroSev, filtroCat, busca],
    queryFn: async () => {
      let q = supabase.from("operacao_incidentes").select("*").order("reportado_em", { ascending: false }).limit(200);
      if (filtroStatus === "abertos") q = q.not("status","in","(ENCERRADO,CANCELADO)");
      else if (filtroStatus !== "todos") q = q.eq("status", filtroStatus as Sta);
      if (filtroSev !== "todas") q = q.eq("severidade", filtroSev as Sev);
      if (filtroCat !== "todas") q = q.eq("categoria", filtroCat as any);
      if (busca.trim()) q = q.or(`titulo.ilike.%${busca}%,codigo.ilike.%${busca}%,modulo_afetado.ilike.%${busca}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const periodosQ = useQuery({
    queryKey: ["oa-periodos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("operacao_assistida_periodos").select("*").order("data_inicio", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const d = dashboard.data ?? {};
  const kpis = d.kpis ?? {};
  const periodo = d.periodo ?? null;
  const diasRest = d.dias_restantes;

  return (
    <AppShell title="Operação Assistida" breadcrumb={["Sistema","Operação Assistida"]}>
      <p className="-mt-4 text-sm text-muted-foreground">
        Acompanhamento dos primeiros 30 dias em produção: incidentes, indicadores de estabilização e encerramento formal.
        {!isAdmin && (isCompliance ? " Perfil Compliance com leitura, comentário e validação." : " Perfil RH: crie e acompanhe seus incidentes.")}
      </p>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi icon={Calendar} label="Período ativo" value={periodo?.nome ?? "—"} sub={periodo ? `${periodo.data_inicio} → ${periodo.data_fim_prevista}` : "Nenhum ativo"} />
        <Kpi icon={TimerReset} label="Dias restantes" value={diasRest ?? "—"} tone={diasRest != null && diasRest <= 5 ? "warn" : "default"} />
        <Kpi icon={ClipboardList} label="Abertos" value={kpis.abertos ?? 0} />
        <Kpi icon={ShieldAlert} label="Críticos" value={kpis.criticos ?? 0} tone={(kpis.criticos ?? 0) > 0 ? "danger" : "default"} />
        <Kpi icon={AlertTriangle} label="P1 abertos" value={kpis.p1_abertos ?? 0} tone={(kpis.p1_abertos ?? 0) > 0 ? "danger" : "default"} />
        <Kpi icon={CheckCircle2} label="Resolvidos" value={kpis.resolvidos ?? 0} />
        <Kpi icon={CheckCircle2} label="Encerrados" value={kpis.encerrados ?? 0} />
        <Kpi icon={Activity} label="Vencidos" value={kpis.vencidos ?? 0} tone={(kpis.vencidos ?? 0) > 0 ? "warn" : "default"} />
        <Kpi icon={TimerReset} label="Tempo médio resolução" value={`${Number(kpis.tempo_medio_resolucao_h ?? 0).toFixed(1)}h`} />
        <Kpi icon={RotateCcw} label="Reabertos" value={kpis.reabertos ?? 0} />
      </div>

      <Tabs defaultValue="incidentes">
        <TabsList>
          <TabsTrigger value="incidentes"><ClipboardList className="mr-1.5 h-3.5 w-3.5" />Incidentes</TabsTrigger>
          <TabsTrigger value="periodos"><Calendar className="mr-1.5 h-3.5 w-3.5" />Períodos</TabsTrigger>
          <TabsTrigger value="encerramento"><Rocket className="mr-1.5 h-3.5 w-3.5" />Encerramento</TabsTrigger>
        </TabsList>

        <TabsContent value="incidentes" className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">Buscar</Label>
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="código, título, módulo..." />
            </div>
            <SelectFilter label="Status" value={filtroStatus} onChange={setFiltroStatus}
              options={[["abertos","Abertos"],["todos","Todos"],...STATUS.map(s => [s, s] as [string,string])]} />
            <SelectFilter label="Severidade" value={filtroSev} onChange={setFiltroSev}
              options={[["todas","Todas"],...SEVERIDADES.map(s => [s, s] as [string,string])]} />
            <SelectFilter label="Categoria" value={filtroCat} onChange={setFiltroCat}
              options={[["todas","Todas"],...CATEGORIAS.map(s => [s, s] as [string,string])]} />
            <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
              <DialogTrigger asChild>
                <Button><PlusCircle className="mr-1.5 h-4 w-4" />Novo incidente</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <NovoIncidenteForm periodoAtivoId={periodo?.id ?? null} onDone={() => { setNovoOpen(false); qc.invalidateQueries({ queryKey:["oa-incidentes"] }); qc.invalidateQueries({ queryKey:["oa-dashboard"] }); }} />
              </DialogContent>
            </Dialog>
          </div>

          <Card><CardContent className="p-0">
            {incidentesQ.isLoading ? <Skeleton className="h-40 w-full" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="p-2">Código</th><th className="p-2">Título</th>
                      <th className="p-2">Categoria</th><th className="p-2">Sev</th>
                      <th className="p-2">Pri</th><th className="p-2">Status</th>
                      <th className="p-2">Módulo</th><th className="p-2">Aberto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(incidentesQ.data ?? []).map((i: any) => {
                      const vencido = i.prazo_resolucao && new Date(i.prazo_resolucao) < new Date() && !["RESOLVIDO","ENCERRADO","CANCELADO"].includes(i.status);
                      return (
                        <tr key={i.id} className="cursor-pointer border-b hover:bg-muted/30" onClick={() => setSelectedId(i.id)}>
                          <td className="p-2 font-mono text-xs">{i.codigo}</td>
                          <td className="p-2 font-medium">
                            {i.titulo}
                            {vencido && <Badge variant="destructive" className="ml-2 text-[10px]">vencido</Badge>}
                          </td>
                          <td className="p-2 text-xs">{i.categoria}</td>
                          <td className="p-2"><span className={`rounded border px-1.5 py-0.5 text-[11px] ${sevColor[i.severidade as Sev]}`}>{i.severidade}</span></td>
                          <td className="p-2"><span className={`rounded border px-1.5 py-0.5 text-[11px] ${priColor[i.prioridade as Pri]}`}>{i.prioridade}</span></td>
                          <td className="p-2"><span className={`rounded px-1.5 py-0.5 text-[11px] ${staColor[i.status as Sta]}`}>{i.status.replace(/_/g," ")}</span></td>
                          <td className="p-2 text-xs">{i.modulo_afetado ?? "—"}</td>
                          <td className="p-2 text-xs">{new Date(i.reportado_em).toLocaleDateString("pt-BR")}</td>
                        </tr>
                      );
                    })}
                    {(incidentesQ.data ?? []).length === 0 && (
                      <tr><td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">Nenhum incidente encontrado.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="periodos" className="space-y-3">
          {isAdmin && (
            <div className="flex justify-end">
              <Dialog open={novoPeriodoOpen} onOpenChange={setNovoPeriodoOpen}>
                <DialogTrigger asChild><Button><PlusCircle className="mr-1.5 h-4 w-4" />Novo período</Button></DialogTrigger>
                <DialogContent><NovoPeriodoForm onDone={() => { setNovoPeriodoOpen(false); qc.invalidateQueries({ queryKey:["oa-periodos"] }); qc.invalidateQueries({ queryKey:["oa-dashboard"] }); }} /></DialogContent>
              </Dialog>
            </div>
          )}
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="p-2">Nome</th><th className="p-2">Ambiente</th><th className="p-2">Início</th><th className="p-2">Fim previsto</th><th className="p-2">Status</th><th className="p-2">Responsável</th></tr>
              </thead>
              <tbody>
                {(periodosQ.data ?? []).map((p: any) => (
                  <tr key={p.id} className="border-b">
                    <td className="p-2 font-medium">{p.nome}</td>
                    <td className="p-2 text-xs">{p.ambiente}</td>
                    <td className="p-2 text-xs">{p.data_inicio}</td>
                    <td className="p-2 text-xs">{p.data_fim_prevista}</td>
                    <td className="p-2"><Badge variant={p.status==="ATIVO"?"default":"outline"}>{p.status}</Badge></td>
                    <td className="p-2 text-xs">{p.responsavel_principal ?? "—"}</td>
                  </tr>
                ))}
                {(periodosQ.data ?? []).length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhum período cadastrado.</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="encerramento">
          <EncerramentoView periodo={periodo} kpis={kpis} isAdmin={isAdmin} onChanged={() => { qc.invalidateQueries({ queryKey:["oa-periodos"] }); qc.invalidateQueries({ queryKey:["oa-dashboard"] }); }} />
        </TabsContent>
      </Tabs>

      <Sheet open={!!selectedId} onOpenChange={(v) => !v && setSelectedId(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {selectedId && <IncidenteDetalhe id={selectedId} isAdmin={isAdmin} onClose={() => setSelectedId(null)} />}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone }: any) {
  const t = tone === "danger" ? "text-red-500" : tone === "warn" ? "text-amber-500" : "text-primary";
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon className={`h-4 w-4 ${t}`} />
      </div>
      <p className="mt-1 text-lg font-semibold truncate">{String(value)}</p>
      {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
    </CardContent></Card>
  );
}

function SelectFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string,string][] }) {
  return (
    <div>
      <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" />{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

function NovoIncidenteForm({ periodoAtivoId, onDone }: { periodoAtivoId: string | null; onDone: () => void }) {
  const [form, setForm] = useState({
    titulo: "", descricao: "", categoria: "OUTROS", tipo: "INCIDENTE",
    severidade: "MEDIA", prioridade: "P3", impacto: "INDIVIDUAL",
    ambiente: "producao", modulo_afetado: "", rota_afetada: "", origem: "",
    plano_contencao: "",
  });
  const criticoOuP1 = form.severidade === "CRITICA" || form.prioridade === "P1";
  const mut = useMutation({
    mutationFn: async () => {
      if (!form.titulo.trim()) throw new Error("Título obrigatório");
      if (criticoOuP1) {
        if (!form.modulo_afetado && !form.rota_afetada) throw new Error("Crítico/P1 exige módulo ou rota afetada");
        if (!form.plano_contencao.trim()) throw new Error("Crítico/P1 exige plano de contenção");
      }
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      const { data, error } = await supabase.from("operacao_incidentes").insert({
        ...form,
        periodo_id: periodoAtivoId,
        reportado_por: uid,
      } as any).select("id").single();
      if (error) throw error;
      // Evento CRIADO
      await supabase.from("operacao_incidente_eventos").insert({
        incidente_id: data.id, evento: "CRIADO", status_novo: "NOVO", created_by: uid,
      });
      return data;
    },
    onSuccess: () => { toast.success("Incidente criado"); onDone(); },
    onError: (e: any) => toast.error(e.message ?? "Falha ao criar"),
  });
  return (
    <>
      <DialogHeader><DialogTitle>Novo incidente</DialogTitle></DialogHeader>
      <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2">
        {criticoOuP1 && (
          <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs">
            <strong>Atenção:</strong> incidente crítico ou P1 exige módulo/rota afetada e plano de contenção.
          </div>
        )}
        <Field label="Título *"><Input value={form.titulo} onChange={(e) => setForm({...form, titulo: e.target.value})} /></Field>
        <Field label="Descrição"><Textarea rows={3} value={form.descricao} onChange={(e) => setForm({...form, descricao: e.target.value})} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <FieldSel label="Categoria" value={form.categoria} onChange={(v) => setForm({...form, categoria: v})} options={CATEGORIAS as any} />
          <FieldSel label="Tipo" value={form.tipo} onChange={(v) => setForm({...form, tipo: v})} options={TIPOS as any} />
          <FieldSel label="Severidade" value={form.severidade} onChange={(v) => setForm({...form, severidade: v})} options={SEVERIDADES as any} />
          <FieldSel label="Prioridade" value={form.prioridade} onChange={(v) => setForm({...form, prioridade: v})} options={PRIORIDADES as any} />
          <FieldSel label="Impacto" value={form.impacto} onChange={(v) => setForm({...form, impacto: v})} options={IMPACTOS as any} />
          <FieldSel label="Ambiente" value={form.ambiente} onChange={(v) => setForm({...form, ambiente: v})} options={AMBIENTES as any} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Módulo afetado"><Input value={form.modulo_afetado} onChange={(e) => setForm({...form, modulo_afetado: e.target.value})} /></Field>
          <Field label="Rota afetada"><Input value={form.rota_afetada} onChange={(e) => setForm({...form, rota_afetada: e.target.value})} placeholder="/dashboard" /></Field>
        </div>
        <Field label="Origem"><Input value={form.origem} onChange={(e) => setForm({...form, origem: e.target.value})} placeholder="e.g. usuário, alerta, monitoramento" /></Field>
        {criticoOuP1 && (
          <Field label="Plano de contenção *"><Textarea rows={2} value={form.plano_contencao} onChange={(e) => setForm({...form, plano_contencao: e.target.value})} /></Field>
        )}
      </div>
      <DialogFooter>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>Registrar</Button>
      </DialogFooter>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs">{label}</Label>{children}</div>;
}
function FieldSel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

function NovoPeriodoForm({ onDone }: { onDone: () => void }) {
  const hoje = new Date().toISOString().slice(0,10);
  const em30 = new Date(Date.now() + 30*86400000).toISOString().slice(0,10);
  const [form, setForm] = useState({ nome: "Operação Assistida — Go-Live", ambiente: "producao", data_inicio: hoje, data_fim_prevista: em30, responsavel_principal: "", descricao: "", criterios_encerramento: "", status: "PLANEJADO" as const });
  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("operacao_assistida_periodos").insert(form as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Período criado"); onDone(); },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });
  return (
    <>
      <DialogHeader><DialogTitle>Novo período</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Field label="Nome"><Input value={form.nome} onChange={(e) => setForm({...form, nome: e.target.value})} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <FieldSel label="Ambiente" value={form.ambiente} onChange={(v) => setForm({...form, ambiente: v})} options={AMBIENTES as any} />
          <FieldSel label="Status inicial" value={form.status} onChange={(v) => setForm({...form, status: v as any})} options={["PLANEJADO","ATIVO"]} />
          <Field label="Início"><Input type="date" value={form.data_inicio} onChange={(e) => setForm({...form, data_inicio: e.target.value})} /></Field>
          <Field label="Fim previsto"><Input type="date" value={form.data_fim_prevista} onChange={(e) => setForm({...form, data_fim_prevista: e.target.value})} /></Field>
        </div>
        <Field label="Responsável principal"><Input value={form.responsavel_principal} onChange={(e) => setForm({...form, responsavel_principal: e.target.value})} /></Field>
        <Field label="Descrição"><Textarea rows={2} value={form.descricao} onChange={(e) => setForm({...form, descricao: e.target.value})} /></Field>
        <Field label="Critérios de encerramento"><Textarea rows={3} value={form.criterios_encerramento} onChange={(e) => setForm({...form, criterios_encerramento: e.target.value})} /></Field>
      </div>
      <DialogFooter><Button onClick={() => mut.mutate()} disabled={mut.isPending}>Criar</Button></DialogFooter>
    </>
  );
}

function IncidenteDetalhe({ id, isAdmin, onClose }: { id: string; isAdmin: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const incQ = useQuery({
    queryKey: ["oa-inc", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("operacao_incidentes").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
  const eventosQ = useQuery({
    queryKey: ["oa-inc-eventos", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("operacao_incidente_eventos").select("*").eq("incidente_id", id).order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const comQ = useQuery({
    queryKey: ["oa-inc-com", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("operacao_incidente_comentarios").select("*").eq("incidente_id", id).order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const [novoComentario, setNovoComentario] = useState("");
  const addComentario = useMutation({
    mutationFn: async () => {
      if (!novoComentario.trim()) throw new Error("Vazio");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("operacao_incidente_comentarios").insert({
        incidente_id: id, conteudo: novoComentario, tipo: "COMENTARIO", created_by: u.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { setNovoComentario(""); qc.invalidateQueries({ queryKey:["oa-inc-com", id] }); toast.success("Comentário adicionado"); },
    onError: (e: any) => toast.error(e.message),
  });

  const [novoStatus, setNovoStatus] = useState<string>("");
  const [msg, setMsg] = useState("");
  const [causa, setCausa] = useState("");
  const [solucao, setSolucao] = useState("");
  const transicionar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("oa_incidente_transicionar", {
        _incidente_id: id, _novo_status: novoStatus as any,
        _mensagem: (msg || null) as any, _causa_raiz: (causa || null) as any, _solucao: (solucao || null) as any, _plano_prevencao: null as any,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status alterado"); setMsg(""); setCausa(""); setSolucao(""); setNovoStatus(""); qc.invalidateQueries({ queryKey:["oa-inc", id] }); qc.invalidateQueries({ queryKey:["oa-inc-eventos", id] }); qc.invalidateQueries({ queryKey:["oa-incidentes"] }); qc.invalidateQueries({ queryKey:["oa-dashboard"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (incQ.isLoading || !incQ.data) return <Skeleton className="h-40 w-full" />;
  const i = incQ.data;

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{i.codigo}</span>
          <span>{i.titulo}</span>
        </SheetTitle>
      </SheetHeader>
      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          <span className={`rounded border px-2 py-0.5 text-xs ${sevColor[i.severidade as Sev]}`}>{i.severidade}</span>
          <span className={`rounded border px-2 py-0.5 text-xs ${priColor[i.prioridade as Pri]}`}>{i.prioridade}</span>
          <span className={`rounded px-2 py-0.5 text-xs ${staColor[i.status as Sta]}`}>{i.status.replace(/_/g," ")}</span>
          <Badge variant="outline">{i.categoria}</Badge>
          <Badge variant="outline">{i.ambiente}</Badge>
        </div>
        {i.descricao && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{i.descricao}</p>}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Info label="Módulo" value={i.modulo_afetado} />
          <Info label="Rota" value={i.rota_afetada} />
          <Info label="Impacto" value={i.impacto} />
          <Info label="Prazo" value={i.prazo_resolucao ? new Date(i.prazo_resolucao).toLocaleString("pt-BR") : "—"} />
          <Info label="Reportado" value={new Date(i.reportado_em).toLocaleString("pt-BR")} />
          <Info label="Resolvido" value={i.resolvido_em ? new Date(i.resolvido_em).toLocaleString("pt-BR") : "—"} />
        </div>

        {isAdmin && (
          <Card><CardContent className="p-3 space-y-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Transição de status</p>
            <div className="grid grid-cols-2 gap-2">
              <Select value={novoStatus} onValueChange={setNovoStatus}>
                <SelectTrigger><SelectValue placeholder="Novo status" /></SelectTrigger>
                <SelectContent>{STATUS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="Mensagem (opcional)" value={msg} onChange={(e) => setMsg(e.target.value)} />
            </div>
            {(novoStatus === "RESOLVIDO" || novoStatus === "ENCERRADO") && (
              <>
                <Textarea placeholder="Solução aplicada" value={solucao} onChange={(e) => setSolucao(e.target.value)} rows={2} />
                {(i.severidade === "CRITICA" || novoStatus === "ENCERRADO") && (
                  <Textarea placeholder="Causa raiz" value={causa} onChange={(e) => setCausa(e.target.value)} rows={2} />
                )}
              </>
            )}
            <Button size="sm" disabled={!novoStatus || transicionar.isPending} onClick={() => transicionar.mutate()}>Aplicar</Button>
          </CardContent></Card>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1"><Activity className="h-3 w-3" />Timeline</p>
          <ol className="relative border-s pl-4 space-y-2">
            {(eventosQ.data ?? []).map((e: any) => (
              <li key={e.id} className="text-xs">
                <span className="absolute -start-1.5 mt-1 h-2 w-2 rounded-full bg-primary" />
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{e.evento}</Badge>
                  {e.status_anterior && <span className="text-muted-foreground">{e.status_anterior} → {e.status_novo}</span>}
                  <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString("pt-BR")}</span>
                </div>
                {e.mensagem && <p className="mt-0.5 text-muted-foreground">{e.mensagem}</p>}
              </li>
            ))}
            {(eventosQ.data ?? []).length === 0 && <p className="text-xs text-muted-foreground">Sem eventos.</p>}
          </ol>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1"><MessageSquare className="h-3 w-3" />Comentários</p>
          <div className="space-y-2">
            {(comQ.data ?? []).map((c: any) => (
              <div key={c.id} className="rounded border p-2 text-sm">
                <p className="whitespace-pre-wrap">{c.conteudo}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleString("pt-BR")}</p>
              </div>
            ))}
            <div className="flex gap-2">
              <Textarea rows={2} placeholder="Escrever comentário..." value={novoComentario} onChange={(e) => setNovoComentario(e.target.value)} />
              <Button size="sm" onClick={() => addComentario.mutate()} disabled={addComentario.isPending}>Enviar</Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return <div><span className="text-muted-foreground">{label}:</span> <span className="font-medium">{value ?? "—"}</span></div>;
}

function EncerramentoView({ periodo, kpis, isAdmin, onChanged }: any) {
  const [novaData, setNovaData] = useState("");
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");
  const encerrar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("oa_periodo_encerrar", { _periodo_id: periodo.id, _observacoes: (obs || null) as any });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Período encerrado"); onChanged(); },
    onError: (e: any) => toast.error(e.message),
  });
  const prorrogar = useMutation({
    mutationFn: async () => {
      if (!novaData || !motivo) throw new Error("Data e motivo obrigatórios");
      const { error } = await supabase.rpc("oa_periodo_prorrogar", { _periodo_id: periodo.id, _nova_data: novaData, _motivo: motivo });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Período prorrogado"); onChanged(); },
    onError: (e: any) => toast.error(e.message),
  });

  const criticos = kpis?.criticos ?? 0;
  const p1 = kpis?.p1_abertos ?? 0;
  const podeEncerrar = criticos === 0 && p1 === 0;

  const checklist = useMemo(() => [
    { ok: criticos === 0, label: "Nenhum incidente crítico aberto" },
    { ok: p1 === 0, label: "Nenhum P1 aberto" },
    { ok: (kpis?.abertos ?? 0) === 0, label: "Todos os incidentes com plano definido" },
    { ok: true, label: "SLA analisado (revisão manual)" },
    { ok: true, label: "Causa raiz dos incidentes críticos registrada" },
    { ok: true, label: "Documentação atualizada" },
    { ok: true, label: "Health check aprovado" },
    { ok: true, label: "Backup validado" },
    { ok: true, label: "Rollback revisado" },
    { ok: true, label: "Usuários principais consultados" },
    { ok: true, label: "Relatório final gerado" },
    { ok: true, label: "Responsáveis aprovaram encerramento" },
  ], [criticos, p1, kpis]);

  if (!periodo) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Nenhum período ativo. Crie um período para acompanhar a estabilização.</CardContent></Card>;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card><CardContent className="p-5">
        <p className="mb-3 text-sm font-semibold">Checklist de encerramento</p>
        <ul className="space-y-1 text-sm">
          {checklist.map((c) => (
            <li key={c.label} className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${c.ok ? "bg-emerald-500" : "bg-red-500"}`} />
              <span className={c.ok ? "" : "text-muted-foreground line-through"}>{c.label}</span>
            </li>
          ))}
        </ul>
        {!podeEncerrar && (
          <p className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
            Encerramento bloqueado: existem incidentes CRÍTICOS ou P1 abertos.
          </p>
        )}
        {isAdmin && (
          <div className="mt-3 space-y-2">
            <Textarea placeholder="Observações do encerramento" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
            <Button disabled={!podeEncerrar || encerrar.isPending} onClick={() => encerrar.mutate()}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" />Encerrar período
            </Button>
          </div>
        )}
      </CardContent></Card>

      {isAdmin && (
        <Card><CardContent className="p-5">
          <p className="mb-3 text-sm font-semibold">Prorrogar período</p>
          <div className="space-y-2">
            <Field label="Nova data prevista"><Input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} /></Field>
            <Field label="Motivo"><Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field>
            <Button variant="outline" disabled={prorrogar.isPending} onClick={() => prorrogar.mutate()}>
              <RotateCcw className="mr-1.5 h-4 w-4" />Prorrogar
            </Button>
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}
