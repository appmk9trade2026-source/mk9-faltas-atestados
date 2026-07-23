// Qualidade dos Dados — painel de integridade.
//
// Extraído da antiga aba `qualidade` de /inteligencia/governanca para dar
// à área o seu próprio escopo visual e de navegação. Nenhuma lógica de
// negócio, RLS, RBAC ou RPC foi alterada — apenas a apresentação.
//
// Categorias:
//   1. Cadastros    — colaboradores/supervisores sem vínculos essenciais.
//   2. Vínculos     — inexistentes, órfãos, empresa×projeto inconsistentes.
//   3. Importação   — divergências, últimas execuções, avisos.
//   4. Reconciliação — botões de reprocessamento e reconciliação.
//   5. Configuração — parâmetros ausentes/inválidos.

import * as React from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Download,
  FileSpreadsheet,
  Link2,
  RefreshCw,
  Settings,
  Users2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { IntelligenceHeader } from "@/components/inteligencia/intelligence-nav";
import { SupervisorEmptyState } from "@/components/supervisor-empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useSessionScope } from "@/hooks/use-session-scope";
import {
  reconciliarSupervisores,
  type ReconciliarSupervisoresResultado,
} from "@/lib/reconciliar-supervisores.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inteligencia/qualidade")({
  head: () => ({
    meta: [
      { title: "Qualidade dos Dados · Inteligência · CRM MK9" },
      {
        name: "description",
        content:
          "Monitoramento da integridade e consistência dos cadastros, vínculos, importações e configurações do módulo de Inteligência.",
      },
      { property: "og:title", content: "Qualidade dos Dados · CRM MK9" },
      {
        property: "og:description",
        content:
          "Painel de integridade dos dados operacionais do CRM MK9 — cadastros, vínculos, importações e reconciliação.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RedirectToInteligencia,
});

function RedirectToInteligencia() {
  return <Navigate to="/inteligencia" search={{ tab: "qualidade" }} replace />;
}

// ─── Tipos ────────────────────────────────────────────────────────────
type Severity = "info" | "warn" | "critical";
type Categoria = "cadastros" | "vinculos" | "importacao" | "configuracao";

type CheckCard = {
  id: string;
  categoria: Categoria;
  label: string;
  count: number;
  hint: string;
  severity: Severity;
  link?: { to: string; label: string };
  sample?: string[];
};

// ─── Página ───────────────────────────────────────────────────────────
export function QualidadePage() {
  const { loading, roles } = useSession();
  const scope = useSessionScope();
  const isSupervisorOnly =
    roles.length > 0 && roles.every((r) => r === "supervisor");
  const canReconciliar =
    roles.includes("super_admin") || roles.includes("rh");

  if (loading) {
    return (
      <AppShell title="Qualidade dos Dados">
        <Skeleton className="h-96 w-full" />
      </AppShell>
    );
  }

  return (
    <AppShell title="Qualidade dos Dados">
      <TooltipProvider delayDuration={250}>
        <div className="space-y-6">
          <IntelligenceHeader
            current="/inteligencia/qualidade"
            title="Qualidade dos Dados"
            subtitle="Monitoramento da integridade e consistência das informações — cadastros, vínculos, importação, reconciliação e configuração."
            icon={ClipboardCheck}
          />

          {isSupervisorOnly ? (
            <SupervisorEmptyState
              title="Painel restrito"
              description="Qualidade dos dados agrega toda a organização e é disponível para RH, Compliance e Super Admin."
            />
          ) : (
            <QualidadeContent
              scopeReady={scope.ready}
              keyParts={scope.keyParts}
              canReconciliar={canReconciliar}
            />
          )}
        </div>
      </TooltipProvider>
    </AppShell>
  );
}

// ─── Conteúdo ─────────────────────────────────────────────────────────
function QualidadeContent({
  scopeReady,
  keyParts,
  canReconciliar,
}: {
  scopeReady: boolean;
  keyParts: readonly string[];
  canReconciliar: boolean;
}) {
  const q = useQuery({
    queryKey: ["qualidade", "dataset", ...keyParts],
    enabled: scopeReady,
    queryFn: async () => {
      const [empresas, projetos, colaboradores, supervisores, config] =
        await Promise.all([
          supabase.from("empresas").select("id, nome, ativo"),
          supabase.from("projetos").select("id, nome, empresa_id, ativo"),
          supabase
            .from("colaboradores")
            .select(
              "id, nome_completo, ativo, empresa_id, projeto_id, supervisor_usuario_id, supervisor_email",
            ),
          supabase.from("profiles").select("id, nome, ativo"),
          supabase
            .from("absenteismo_config")
            .select("janela_dias, limiar_atencao, limiar_alta, limiar_critica, updated_at")
            .limit(1),
        ]);
      if (empresas.error) throw empresas.error;
      if (projetos.error) throw projetos.error;
      if (colaboradores.error) throw colaboradores.error;
      if (supervisores.error) throw supervisores.error;
      if (config.error) throw config.error;
      return {
        empresas: empresas.data ?? [],
        projetos: projetos.data ?? [],
        colaboradores: colaboradores.data ?? [],
        supervisores: supervisores.data ?? [],
        config: config.data?.[0] ?? null,
      };
    },
    staleTime: 60_000,
  });

  if (q.isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-destructive">
            Falha ao carregar
          </CardTitle>
          <CardDescription>
            {(q.error as Error)?.message ?? "Erro desconhecido."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { empresas, projetos, colaboradores, supervisores, config } = q.data!;
  const empresasAtivas = empresas.filter((e) => e.ativo);
  const projetosAtivos = projetos.filter((p) => p.ativo);
  const colabAtivos = colaboradores.filter((c) => c.ativo);
  const supActivos = supervisores.filter((s) => s.ativo);

  const projByEmpresa = new Map<string, number>();
  projetosAtivos.forEach((p) =>
    projByEmpresa.set(
      p.empresa_id as string,
      (projByEmpresa.get(p.empresa_id as string) ?? 0) + 1,
    ),
  );

  const supComEquipe = new Set(
    colabAtivos
      .map((c) => c.supervisor_usuario_id)
      .filter(Boolean) as string[],
  );
  const projComSup = new Set(
    colabAtivos
      .filter((c) => c.projeto_id && c.supervisor_usuario_id)
      .map((c) => c.projeto_id as string),
  );

  const cards: CheckCard[] = [
    // ── Cadastros ────────────────────────────────────────────────
    {
      id: "colab_sem_supervisor",
      categoria: "cadastros",
      label: "Colaboradores sem supervisor",
      count: colabAtivos.filter((c) => !c.supervisor_usuario_id).length,
      hint: "Ativos sem supervisor_usuario_id — não recebem alertas via supervisor.",
      severity: colabAtivos.some((c) => !c.supervisor_usuario_id) ? "warn" : "info",
      link: { to: "/colaboradores", label: "Abrir Colaboradores" },
      sample: colabAtivos
        .filter((c) => !c.supervisor_usuario_id)
        .slice(0, 5)
        .map((c) => c.nome_completo as string),
    },
    {
      id: "colab_sem_empresa",
      categoria: "cadastros",
      label: "Colaboradores sem empresa",
      count: colabAtivos.filter((c) => !c.empresa_id).length,
      hint: "Vínculo com empresa ausente.",
      severity: colabAtivos.some((c) => !c.empresa_id) ? "critical" : "info",
      link: { to: "/colaboradores", label: "Abrir Colaboradores" },
    },
    {
      id: "colab_sem_projeto",
      categoria: "cadastros",
      label: "Colaboradores sem projeto",
      count: colabAtivos.filter((c) => !c.projeto_id).length,
      hint: "Sem projeto — não entram em rankings por projeto.",
      severity: colabAtivos.some((c) => !c.projeto_id) ? "warn" : "info",
      link: { to: "/colaboradores", label: "Abrir Colaboradores" },
    },
    {
      id: "sup_sem_equipe",
      categoria: "cadastros",
      label: "Supervisores ativos sem equipe",
      count: supActivos.filter((s) => !supComEquipe.has(s.id as string)).length,
      hint: "Perfis ativos com papel Supervisor sem colaboradores atribuídos.",
      severity: "info",
      link: { to: "/usuarios", label: "Gerenciar usuários" },
      sample: supActivos
        .filter((s) => !supComEquipe.has(s.id as string))
        .slice(0, 5)
        .map((s) => s.nome as string),
    },
    // ── Vínculos ─────────────────────────────────────────────────
    {
      id: "proj_sem_sup",
      categoria: "vinculos",
      label: "Projetos ativos sem supervisor",
      count: projetosAtivos.filter((p) => !projComSup.has(p.id as string)).length,
      hint: "Nenhum colaborador ativo do projeto tem supervisor definido.",
      severity: projetosAtivos.some((p) => !projComSup.has(p.id as string))
        ? "warn"
        : "info",
      link: { to: "/configuracoes/projetos", label: "Abrir Projetos" },
      sample: projetosAtivos
        .filter((p) => !projComSup.has(p.id as string))
        .slice(0, 5)
        .map((p) => p.nome as string),
    },
    {
      id: "emp_sem_proj",
      categoria: "vinculos",
      label: "Empresas ativas sem projetos ativos",
      count: empresasAtivas.filter((e) => !projByEmpresa.get(e.id as string))
        .length,
      hint: "Empresa ativa sem projetos operacionais.",
      severity: "info",
      link: { to: "/configuracoes/empresas", label: "Abrir Empresas" },
      sample: empresasAtivas
        .filter((e) => !projByEmpresa.get(e.id as string))
        .slice(0, 5)
        .map((e) => e.nome as string),
    },
    {
      id: "colab_projeto_orfao",
      categoria: "vinculos",
      label: "Colaboradores em projeto inativo",
      count: colabAtivos.filter(
        (c) =>
          c.projeto_id && !projetosAtivos.find((p) => p.id === c.projeto_id),
      ).length,
      hint: "Registros órfãos — projeto inativo ou removido.",
      severity: colabAtivos.some(
        (c) =>
          c.projeto_id && !projetosAtivos.find((p) => p.id === c.projeto_id),
      )
        ? "critical"
        : "info",
      link: { to: "/colaboradores", label: "Abrir Colaboradores" },
    },
    {
      id: "colab_empresa_inconsistente",
      categoria: "vinculos",
      label: "Vínculos empresa × projeto inconsistentes",
      count: colabAtivos.filter((c) => {
        if (!c.projeto_id) return false;
        const proj = projetos.find((p) => p.id === c.projeto_id);
        return proj && c.empresa_id && proj.empresa_id !== c.empresa_id;
      }).length,
      hint: "Empresa do colaborador difere da empresa do projeto.",
      severity: "critical",
      link: { to: "/colaboradores", label: "Abrir Colaboradores" },
    },
    // ── Importação ───────────────────────────────────────────────
    {
      id: "colab_dup",
      categoria: "importacao",
      label: "Possíveis colaboradores duplicados",
      count: (() => {
        const map = new Map<string, number>();
        colabAtivos.forEach((c) => {
          const key = `${(c.nome_completo as string).trim().toLowerCase()}::${c.empresa_id ?? ""}`;
          map.set(key, (map.get(key) ?? 0) + 1);
        });
        return Array.from(map.values()).filter((n) => n > 1).length;
      })(),
      hint: "Mesmo nome dentro da mesma empresa (ativos).",
      severity: "warn",
      link: { to: "/colaboradores", label: "Revisar colaboradores" },
    },
    {
      id: "colab_email_sup_vazio",
      categoria: "importacao",
      label: "Colaboradores sem e-mail de supervisor",
      count: colabAtivos.filter(
        (c) => !(c.supervisor_email as string | null)?.trim(),
      ).length,
      hint: "Sem supervisor_email a reconciliação por planilha não consegue vincular automaticamente.",
      severity: "info",
      link: {
        to: "/colaboradores_/reprocessar-supervisores",
        label: "Reprocessar por planilha",
      },
    },
    // ── Configuração ─────────────────────────────────────────────
    {
      id: "cfg_ausente",
      categoria: "configuracao",
      label: "Configuração de absenteísmo",
      count: !config ? 1 : 0,
      hint: config
        ? `Janela ${config.janela_dias}d · limiares ${config.limiar_atencao}/${config.limiar_alta}/${config.limiar_critica}. Atualizada em ${new Date(config.updated_at).toLocaleDateString("pt-BR")}.`
        : "Nenhuma configuração persistida — o motor de score usa defaults.",
      severity: !config ? "warn" : "info",
      link: { to: "/inteligencia/configuracao", label: "Ajustar configuração" },
    },
    {
      id: "cfg_limiar_invalido",
      categoria: "configuracao",
      label: "Limiares de criticidade inválidos",
      count:
        config &&
        !(
          config.limiar_atencao < config.limiar_alta &&
          config.limiar_alta < config.limiar_critica
        )
          ? 1
          : 0,
      hint: "Ordem esperada: atenção < alta < crítica.",
      severity: "critical",
      link: { to: "/inteligencia/configuracao", label: "Ajustar configuração" },
    },
  ];

  const grouped: Record<Categoria, CheckCard[]> = {
    cadastros: [],
    vinculos: [],
    importacao: [],
    configuracao: [],
  };
  cards.forEach((c) => grouped[c.categoria].push(c));

  const totalIssues = cards.reduce((s, c) => s + (c.count > 0 ? 1 : 0), 0);
  const totalCritical = cards.filter(
    (c) => c.count > 0 && c.severity === "critical",
  ).length;

  return (
    <div className="space-y-8">
      {/* Resumo */}
      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardContent className="py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Resumo de integridade</p>
              <p className="text-xs text-muted-foreground">
                {totalIssues === 0
                  ? "Nenhuma inconsistência encontrada nos cadastros analisados."
                  : `${totalIssues} indicador${totalIssues > 1 ? "es" : ""} pedem atenção · ${totalCritical} crítico${totalCritical === 1 ? "" : "s"}.`}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void q.refetch()}
              disabled={q.isFetching}
            >
              <RefreshCw
                className={cn("h-4 w-4 mr-2", q.isFetching && "animate-spin")}
              />
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reconciliação — no topo, é a ação corretiva mais usada */}
      <ReconciliacaoSection
        canReconciliar={canReconciliar}
        keyParts={keyParts}
      />

      {/* Cadastros */}
      <CategorySection
        icon={Users2}
        title="Cadastros"
        subtitle="Colaboradores e supervisores com campos essenciais ausentes."
        cards={grouped.cadastros}
      />

      {/* Vínculos */}
      <CategorySection
        icon={Link2}
        title="Vínculos"
        subtitle="Relações entre colaboradores, projetos, empresas e supervisores."
        cards={grouped.vinculos}
      />

      {/* Importação */}
      <CategorySection
        icon={FileSpreadsheet}
        title="Importação"
        subtitle="Divergências e sinais de dados inconsistentes vindos de planilhas."
        cards={grouped.importacao}
      />

      {/* Configuração */}
      <CategorySection
        icon={Settings}
        title="Configuração"
        subtitle="Parâmetros do motor de absenteísmo."
        cards={grouped.configuracao}
      />
    </div>
  );
}

// ─── Reconciliação ────────────────────────────────────────────────────
function ReconciliacaoSection({
  canReconciliar,
  keyParts,
}: {
  canReconciliar: boolean;
  keyParts: readonly string[];
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="rounded-md bg-primary/10 p-1.5 text-primary">
          <Wrench className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-base font-semibold">Reconciliação</h2>
          <p className="text-xs text-muted-foreground">
            Ferramentas corretivas para vincular supervisores e reprocessar
            planilhas.
          </p>
        </div>
      </div>

      {!canReconciliar ? (
        <Card>
          <CardContent className="py-5 text-sm text-muted-foreground">
            Somente Super Admin e RH podem executar reconciliações.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Reconciliar Supervisores
              </CardTitle>
              <CardDescription className="text-xs">
                Percorre colaboradores sem supervisor vinculado e preenche
                <code className="mx-1">supervisor_usuario_id</code> pelo e-mail
                do supervisor.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReconciliarSupervisoresButton keyParts={keyParts} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Reprocessar por planilha
              </CardTitle>
              <CardDescription className="text-xs">
                Reprocessa vínculos de supervisor a partir da planilha original
                de colaboradores.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="sm" variant="outline">
                <Link to="/colaboradores_/reprocessar-supervisores">
                  Abrir ferramenta
                  <ArrowRight className="h-3 w-3 ml-1.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}

function ReconciliarSupervisoresButton({
  keyParts,
}: {
  keyParts: readonly string[];
}) {
  const call = useServerFn(reconciliarSupervisores);
  const qc = useQueryClient();
  const [loading, setLoading] = React.useState(false);
  const [report, setReport] = React.useState<ReconciliarSupervisoresResultado | null>(
    null,
  );

  async function run() {
    setLoading(true);
    try {
      const r = await call();
      setReport(r);
      toast.success(
        `Reconciliação concluída — ${r.atualizados} de ${r.processados} vínculos preenchidos.`,
      );
      await qc.invalidateQueries({ queryKey: ["qualidade", "dataset", ...keyParts] });
      await qc.invalidateQueries({ queryKey: ["inteligencia"] });
      await qc.invalidateQueries({ queryKey: ["colaboradores"] });
    } catch (e) {
      toast.error((e as Error)?.message ?? "Falha ao reconciliar supervisores.");
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    if (!report) return;
    const header = ["colaborador_id", "matricula", "email", "motivo"];
    const lines = [header.join(";")].concat(
      report.detalhes.map((d) =>
        [d.colaborador_id, d.matricula ?? "", d.email ?? "", d.motivo]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(";"),
      ),
    );
    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reconciliacao_supervisores_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <Button size="sm" variant="outline" onClick={run} disabled={loading}>
        <RefreshCw className={cn("h-4 w-4 mr-1.5", loading && "animate-spin")} />
        {loading ? "Reconciliando…" : "Executar reconciliação"}
      </Button>
      {report && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Badge variant="secondary">Processados {report.processados}</Badge>
          <Badge>Atualizados {report.atualizados}</Badge>
          {report.inexistente > 0 && (
            <Badge variant="outline">Inexistente {report.inexistente}</Badge>
          )}
          {report.sem_papel_supervisor > 0 && (
            <Badge variant="outline">
              Sem papel {report.sem_papel_supervisor}
            </Badge>
          )}
          {report.duplicidade > 0 && (
            <Badge variant="outline">Duplicidade {report.duplicidade}</Badge>
          )}
          {report.email_vazio > 0 && (
            <Badge variant="outline">E-mail vazio {report.email_vazio}</Badge>
          )}
          {report.email_invalido > 0 && (
            <Badge variant="outline">
              E-mail inválido {report.email_invalido}
            </Badge>
          )}
          {report.detalhes.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={exportCsv}
              className="h-6 px-2"
            >
              <Download className="h-3 w-3 mr-1" /> CSV
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Categoria (grupo de cards) ───────────────────────────────────────
function CategorySection({
  icon: Icon,
  title,
  subtitle,
  cards,
}: {
  icon: typeof Users2;
  title: string;
  subtitle: string;
  cards: CheckCard[];
}) {
  if (cards.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="rounded-md bg-muted p-1.5 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <QualidadeCard key={c.id} {...c} />
        ))}
      </div>
    </section>
  );
}

function QualidadeCard({
  label,
  count,
  hint,
  severity,
  link,
  sample,
}: CheckCard) {
  const tone =
    count === 0
      ? "text-emerald-600 dark:text-emerald-400"
      : severity === "critical"
        ? "text-destructive"
        : severity === "warn"
          ? "text-amber-600 dark:text-amber-400"
          : "text-foreground";
  const severityLabel =
    count === 0
      ? "OK"
      : severity === "critical"
        ? "Crítico"
        : severity === "warn"
          ? "Atenção"
          : "Informativo";
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-medium">{label}</CardTitle>
          <Tooltip>
            <TooltipTrigger asChild>
              <ClipboardList className="h-4 w-4 text-muted-foreground shrink-0" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{hint}</TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-2">
          <div className={cn("text-3xl font-semibold tabular-nums", tone)}>
            {count.toLocaleString("pt-BR")}
          </div>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              count === 0
                ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                : severity === "critical"
                  ? "border-destructive/40 text-destructive"
                  : severity === "warn"
                    ? "border-amber-500/40 text-amber-600 dark:text-amber-400"
                    : "border-muted-foreground/30 text-muted-foreground",
            )}
          >
            {severityLabel}
          </Badge>
        </div>
        {sample && sample.length > 0 && (
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {sample.map((s) => (
              <li key={s} className="truncate">
                • {s}
              </li>
            ))}
          </ul>
        )}
        {link && count > 0 && (
          <Button asChild size="sm" variant="ghost" className="border w-full justify-between">
            <Link to={link.to}>
              {link.label} <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        )}
        {count === 0 && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Nada a corrigir.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
