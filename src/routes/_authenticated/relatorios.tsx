import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, CalendarClock, FileBarChart2, FileText, HeartPulse, Loader2,
  MessageSquare, ScrollText, ShieldAlert, Stethoscope, Download, FileSpreadsheet,
  FileType2, Play, Clock,
} from "lucide-react";
import { toast } from "sonner";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useSessionScope } from "@/hooks/use-session-scope";
import { exportReport, type ExportFormat, type ReportPayload } from "@/lib/relatorios-export";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios · CRM MK9" }] }),
  component: RelatoriosPage,
});

type ReportId =
  | "absenteismo" | "atestados" | "faltas" | "licencas"
  | "inss" | "medidas" | "comunicacoes" | "auditoria";

type ReportDef = {
  id: ReportId;
  nome: string;
  descricao: string;
  icon: typeof FileText;
  requireAudit?: boolean;
};

const REPORTS: ReportDef[] = [
  { id: "absenteismo", nome: "Absenteísmo Geral", descricao: "Visão consolidada com categorias, tipos oficiais e evolução diária/mensal.", icon: BarChart3 },
  { id: "atestados", nome: "Atestados", descricao: "Quantidade, dias afastados, distribuição por tipo e ranking de projetos.", icon: Stethoscope },
  { id: "faltas", nome: "Faltas", descricao: "Faltas justificadas e injustificadas com ranking de projetos/colaboradores.", icon: FileBarChart2 },
  { id: "licencas", nome: "Licenças", descricao: "Nojo, Gala, Paternidade e Maternidade.", icon: FileText },
  { id: "inss", nome: "Afastamentos INSS", descricao: "Doença e Acidente — em andamento e encerrados.", icon: HeartPulse },
  { id: "medidas", nome: "Medidas Administrativas", descricao: "Suspensões disciplinares e abandono de emprego.", icon: ShieldAlert },
  { id: "comunicacoes", nome: "Comunicações", descricao: "Criadas, aprovadas, enviadas e erros.", icon: MessageSquare },
  { id: "auditoria", nome: "Auditoria", descricao: "Logins, exportações, downloads, alterações e acessos negados.", icon: ScrollText, requireAudit: true },
];

function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }
function today() { return new Date().toISOString().slice(0, 10); }

type Empresa = { id: string; nome: string };
type Projeto = { id: string; nome: string; empresa_id: string };

function RelatoriosPage() {
  const { roles, profile } = useSession();
  const [open, setOpen] = useState<ReportId | null>(null);
  const [lastRun, setLastRun] = useState<Record<string, string>>({});

  const canAudit = roles.includes("super_admin") || roles.includes("compliance") || roles.includes("rh");

  const visible = REPORTS.filter((r) => !r.requireAudit || canAudit);

  const current = REPORTS.find((r) => r.id === open) ?? null;

  return (
    <AppShell title="Relatórios" breadcrumb={["Relatórios"]}>
      <p className="-mt-4 text-sm text-muted-foreground">
        Documentos oficiais da operação. Dados extraídos diretamente do banco e agregados no servidor.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((r) => {
          const Icon = r.icon;
          return (
            <Card key={r.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-3 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{r.nome}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{r.descricao}</p>
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {lastRun[r.id] ? `Última execução: ${lastRun[r.id]}` : "Ainda não executado"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={() => setOpen(r.id)}>
                    <Play className="mr-1.5 h-3.5 w-3.5" /> Gerar
                  </Button>
                  <Button size="sm" variant="outline" disabled title="Em breve">
                    <CalendarClock className="mr-1.5 h-3.5 w-3.5" /> Agendar
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!current} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          {current && (
            <ReportRunner
              report={current}
              usuarioNome={profile?.nome ?? null}
              onRun={() => setLastRun((s) => ({ ...s, [current.id]: new Date().toLocaleString("pt-BR") }))}
            />
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function ReportRunner({ report, usuarioNome, onRun }: { report: ReportDef; usuarioNome: string | null; onRun: () => void }) {
  const scope = useSessionScope();
  const [inicio, setInicio] = useState(firstOfMonth());
  const [fim, setFim] = useState(today());
  const [empresaId, setEmpresaId] = useState<string>("");
  const [projetoId, setProjetoId] = useState<string>("");
  const [supervisor, setSupervisor] = useState("");
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const empresasQ = useQuery<Empresa[]>({
    queryKey: ["rel-empresas", ...scope.keyParts],
    enabled: scope.ready,
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as Empresa[];
    },
    staleTime: 5 * 60_000,
  });

  const projetosQ = useQuery<Projeto[]>({
    queryKey: ["rel-projetos", ...scope.keyParts, empresaId],
    enabled: scope.ready,
    queryFn: async () => {
      let q = supabase.from("projetos").select("id, nome, empresa_id").eq("ativo", true).order("nome");
      if (empresaId) q = q.eq("empresa_id", empresaId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Projeto[];
    },
    staleTime: 5 * 60_000,
  });

  const usesEmpresa = report.id !== "auditoria";
  const usesProjeto = report.id !== "auditoria";
  const usesSupervisor = report.id === "absenteismo";

  const filtrosLabel = useMemo(() => {
    const l: Record<string, string> = { Período: `${inicio} a ${fim}` };
    if (usesEmpresa) l["Empresa"] = empresasQ.data?.find((e) => e.id === empresaId)?.nome ?? "Todas";
    if (usesProjeto) l["Projeto"] = projetosQ.data?.find((p) => p.id === projetoId)?.nome ?? "Todos";
    if (usesSupervisor) l["Supervisor"] = supervisor || "Todos";
    return l;
  }, [inicio, fim, empresaId, projetoId, supervisor, empresasQ.data, projetosQ.data, usesEmpresa, usesProjeto, usesSupervisor]);

  async function run() {
    setExecuting(true);
    try {
      const args: Record<string, unknown> = { _inicio: inicio, _fim: fim };
      if (usesEmpresa) args._empresa_id = empresaId || null;
      if (usesProjeto) args._projeto_id = projetoId || null;
      if (usesSupervisor) args._supervisor = supervisor || null;
      const rpc = `rel_${report.id === "inss" ? "afastamentos_inss" : report.id === "medidas" ? "medidas_administrativas" : report.id}`;
      const { data, error } = await supabase.rpc(rpc as never, args as never);
      if (error) throw error;
      setResult(data);
      onRun();
      toast.success("Relatório gerado.");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao gerar relatório.");
    } finally {
      setExecuting(false);
    }
  }

  async function doExport(formato: ExportFormat) {
    if (!result) {
      toast.info("Gere o relatório primeiro.");
      return;
    }
    const payload: ReportPayload = {
      id: report.id,
      nome: report.nome,
      filtrosLabel,
      usuarioNome,
      sections: buildSections(report.id, result),
    };
    await exportReport(payload, formato);
    toast.success(`Arquivo ${formato.toUpperCase()} gerado.`);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <report.icon className="h-5 w-5 text-primary" /> {report.nome}
        </DialogTitle>
        <DialogDescription>{report.descricao}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Início</Label>
          <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Fim</Label>
          <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
        </div>
        {usesEmpresa && (
          <div className="space-y-1.5">
            <Label>Empresa</Label>
            <Select value={empresaId || "all"} onValueChange={(v) => { setEmpresaId(v === "all" ? "" : v); setProjetoId(""); }}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {(empresasQ.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {usesProjeto && (
          <div className="space-y-1.5">
            <Label>Projeto</Label>
            <Select value={projetoId || "all"} onValueChange={(v) => setProjetoId(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(projetosQ.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {usesSupervisor && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Supervisor</Label>
            <Input placeholder="Nome do supervisor" value={supervisor} onChange={(e) => setSupervisor(e.target.value)} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={run} disabled={executing}>
          {executing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          Gerar relatório
        </Button>
        <Separator orientation="vertical" className="mx-1 h-6" />
        <Button variant="outline" size="sm" onClick={() => doExport("xlsx")} disabled={!result}>
          <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
        </Button>
        <Button variant="outline" size="sm" onClick={() => doExport("csv")} disabled={!result}>
          <Download className="mr-1.5 h-4 w-4" /> CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => doExport("pdf")} disabled={!result}>
          <FileType2 className="mr-1.5 h-4 w-4" /> PDF
        </Button>
      </div>

      {result && (
        <div className="space-y-4">
          <Separator />
          <ReportPreview id={report.id} data={result} />
        </div>
      )}
    </>
  );
}

/* ----------------- Preview e mapeamento em seções ------------------ */

function ReportPreview({ id, data }: { id: ReportId; data: any }) {
  const sections = buildSections(id, data);
  return (
    <div className="space-y-4">
      {sections.map((s) => (
        <div key={s.title}>
          <p className="mb-2 text-sm font-semibold">{s.title}</p>
          {s.rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem dados no período.</p>
          ) : (
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {Object.keys(s.rows[0]).map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {s.rows.slice(0, 25).map((r, i) => (
                    <tr key={i} className="border-t">
                      {Object.keys(s.rows[0]).map((h) => (
                        <td key={h} className="px-3 py-1.5 tabular-nums">{String(r[h] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {s.rows.length > 25 && (
                <div className="border-t bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
                  Exibindo 25 de {s.rows.length} · exporte para ver o conteúdo completo.
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function buildSections(id: ReportId, d: any): { title: string; rows: Record<string, string | number>[] }[] {
  switch (id) {
    case "absenteismo":
      return [
        {
          title: "Resumo Executivo",
          rows: [
            {
              "Total de Faltas": d.kpis?.total_faltas ?? 0,
              "Total de Atestados": d.kpis?.total_atestados ?? 0,
              "Total de Ocorrências": d.kpis?.total_ocorrencias ?? 0,
              "Total de Dias": d.kpis?.total_dias ?? 0,
              "Taxa de Absenteísmo": "Taxa indisponível para este conjunto de dados.",
            },
          ],
        },
        {
          title: "Por Projeto",
          rows: (d.ranking_projetos ?? []).map((r: any) => ({
            Projeto: r.projeto,
            Empresa: r.empresa,
            Colaboradores: r.colaboradores,
            Faltas: r.faltas,
            Atestados: r.atestados,
            "Dias Ausência": r.dias_ausencia,
            "Total Ocorrências": r.total_ocorrencias,
          })),
        },
        {
          title: "Por Colaborador",
          rows: (d.ranking_colaboradores ?? []).map((r: any) => ({
            Matrícula: r.matricula,
            Nome: r.nome,
            Projeto: r.projeto,
            Supervisor: r.supervisor,
            Faltas: r.faltas,
            Atestados: r.atestados,
            "Dias Ausência": r.dias_ausencia,
            "Total Ocorrências": r.total_ocorrencias,
            "Última Ocorrência": r.ultima_ocorrencia,
          })),
        },
        {
          title: "Plano de Ação",
          rows: [
            {
              Projeto: "",
              "Colaborador/Grupo": "",
              "Problema Identificado": "",
              "Indicador Atual": "",
              Meta: "",
              "Ação Proposta": "",
              Responsável: "",
              Prazo: "",
              Status: "NÃO INICIADO",
              Resultado: "",
              "Observações Gerenciais": "",
            },
          ],
        },
        {
          title: "Metodologia",
          rows: [
            { Item: "Fonte", Valor: "public.rel_absenteismo (Fase 1)" },
            { Item: "Regra", Valor: "Somente registros com status_documental = 'ATIVO'" },
            { Item: "Falta", Valor: "Lançamentos tipificados como FALTA" },
            { Item: "Atestado", Valor: "Lançamentos tipificados como ATESTADO" },
            { Item: "Privacidade", Valor: "Dados médicos sensíveis (CID, Imagens, Diagnóstico) omitidos por governança." },
            { Item: "Geração", Valor: new Date().toLocaleString("pt-BR") },
          ],
        },
      ];
    case "atestados":
      return [
        { title: "Resumo", rows: [{ Quantidade: d.quantidade ?? 0, "Dias afastados": d.dias ?? 0 }] },
        { title: "Distribuição por tipo", rows: (d.por_tipo ?? []).map((r: any) => ({ Tipo: r.nome, Total: r.total, Dias: r.dias })) },
        { title: "Ranking de projetos", rows: (d.ranking_projetos ?? []).map((r: any) => ({ Projeto: r.nome, Total: r.total, Dias: r.dias })) },
      ];
    case "faltas":
      return [
        { title: "Justificadas", rows: [{ Quantidade: d.justificadas?.quantidade ?? 0, Dias: d.justificadas?.dias ?? 0 }] },
        { title: "Injustificadas", rows: [{ Quantidade: d.injustificadas?.quantidade ?? 0, Dias: d.injustificadas?.dias ?? 0 }] },
        { title: "Ranking de projetos", rows: (d.ranking_projetos ?? []).map((r: any) => ({ Projeto: r.nome, Total: r.total, Dias: r.dias })) },
        { title: "Ranking de colaboradores", rows: (d.ranking_colaboradores ?? []).map((r: any) => ({ Colaborador: r.nome, Total: r.total, Dias: r.dias })) },
      ];
    case "licencas":
      return [
        { title: "Resumo", rows: [{ Quantidade: d.quantidade ?? 0, Dias: d.dias ?? 0 }] },
        { title: "Por tipo", rows: (d.por_tipo ?? []).map((r: any) => ({ Tipo: r.nome, Código: r.codigo, Total: r.total, Dias: r.dias })) },
      ];
    case "inss":
      return [
        { title: "Doença", rows: [{ Quantidade: d.doenca?.quantidade ?? 0, Dias: d.doenca?.dias ?? 0, "Em andamento": d.doenca?.em_andamento ?? 0, Encerrados: d.doenca?.encerrados ?? 0 }] },
        { title: "Acidente", rows: [{ Quantidade: d.acidente?.quantidade ?? 0, Dias: d.acidente?.dias ?? 0, "Em andamento": d.acidente?.em_andamento ?? 0, Encerrados: d.acidente?.encerrados ?? 0 }] },
      ];
    case "medidas":
      return [
        { title: "Suspensões", rows: [{ Quantidade: d.suspensoes?.quantidade ?? 0, Dias: d.suspensoes?.dias ?? 0 }] },
        { title: "Abandono de Emprego", rows: [{ Quantidade: d.abandono?.quantidade ?? 0, Dias: d.abandono?.dias ?? 0 }] },
      ];
    case "comunicacoes":
      return [
        { title: "Resumo", rows: [{ Criadas: d.criadas ?? 0, Aprovadas: d.aprovadas ?? 0, Enviadas: d.enviadas ?? 0, Erros: d.erros ?? 0 }] },
        { title: "Por canal", rows: (d.por_canal ?? []).map((r: any) => ({ Canal: r.canal, Total: r.total })) },
      ];
    case "auditoria":
      return [
        { title: "Resumo", rows: [{
          Logins: d.logins ?? 0, Logouts: d.logouts ?? 0, Exportações: d.exportacoes ?? 0,
          Downloads: d.downloads ?? 0, Alterações: d.alteracoes ?? 0, "Acessos negados": d.acessos_negados ?? 0,
        }] },
        { title: "Por módulo", rows: (d.por_modulo ?? []).map((r: any) => ({ Módulo: r.modulo, Total: r.total })) },
        { title: "Por usuário", rows: (d.por_usuario ?? []).map((r: any) => ({ Usuário: r.usuario, Total: r.total })) },
      ];
  }
}

function pct(v: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((v / total) * 1000) / 10}%`;
}

// hint for unused imports
