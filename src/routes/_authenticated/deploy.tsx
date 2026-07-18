import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Rocket, ShieldCheck, ClipboardCheck, RotateCcw, PlayCircle, Server,
  CheckCircle2, Circle, AlertTriangle, Undo2, Globe, Lock, Activity,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/use-session";
import { APP_ENV_LABEL, APP_VERSION, APP_BUILD_DATE, APP_COMMIT, buildStamp } from "@/lib/app-meta";
import { env } from "@/lib/env";

export const Route = createFileRoute("/_authenticated/deploy")({
  head: () => ({ meta: [{ title: "Deploy & Go-Live · CRM MK9" }] }),
  component: DeployPage,
});

type ChecklistItem = { id: string; label: string; hint?: string };

const PRE_DEPLOY: ChecklistItem[] = [
  { id: "typecheck", label: "Typecheck aprovado (bun run typecheck)" },
  { id: "unit", label: "Testes unitários aprovados" },
  { id: "smoke", label: "Smoke tests aprovados" },
  { id: "build", label: "Build de produção sem erros" },
  { id: "migrations", label: "Migrations revisadas e aplicadas em homologação" },
  { id: "rls", label: "RLS revalidada nas tabelas críticas" },
  { id: "rpcs", label: "RPCs SECURITY DEFINER revisadas (search_path, checagem de papel)" },
  { id: "triggers", label: "Triggers de imutabilidade ativos (audit_logs, backup_execution_events, comunicacoes)" },
  { id: "storage", label: "Bucket atestados privado e URLs assinadas" },
  { id: "admins", label: "Super Admins de produção confirmados" },
  { id: "vars", label: "Variáveis públicas conferidas (VITE_*) e ausência de service_role no frontend" },
  { id: "domain", label: "Domínio oficial e HTTPS ativos" },
  { id: "callbacks", label: "Callback URLs do Auth e Site URL configurados" },
  { id: "backup", label: "Snapshot ou solicitação de backup registrada" },
  { id: "rollback", label: "Plano de rollback disponível e comunicado" },
  { id: "health", label: "Health check com todos os itens em OK" },
  { id: "logs", label: "Logs sanitizados (sem tokens, sem PII expandida)" },
  { id: "version", label: "Versão, build e commit registrados" },
];

const POS_DEPLOY: ChecklistItem[] = [
  { id: "disp", label: "Aplicação disponível na URL oficial" },
  { id: "resp", label: "Tempo de resposta dentro do esperado" },
  { id: "auth", label: "Login funcional com contas de teste dedicadas" },
  { id: "authz", label: "Papéis aplicando as permissões corretas" },
  { id: "rls_p", label: "RLS efetiva em consultas de leitura" },
  { id: "rpcs_p", label: "RPCs críticas respondendo (dashboard_metrics, operacoes_dashboard, saude_sistema)" },
  { id: "storage_p", label: "Storage lê e escreve anexos existentes" },
  { id: "audit_p", label: "Auditoria registra novos eventos" },
  { id: "reports", label: "Relatórios gerando XLSX/CSV/PDF" },
  { id: "operacoes", label: "Centro de Operações com métricas atualizadas" },
  { id: "logs_p", label: "Logs no console sem erros críticos" },
];

const SMOKE: ChecklistItem[] = [
  { id: "s1", label: "Aplicação carrega em produção", hint: "Somente leitura" },
  { id: "s2", label: "Login com usuário autorizado" },
  { id: "s3", label: "Dashboard abre e carrega KPIs" },
  { id: "s4", label: "Colaboradores lista e abre detalhe" },
  { id: "s5", label: "Importação abre (sem executar)" },
  { id: "s6", label: "Histórico abre" },
  { id: "s7", label: "Ausências lista sem erros" },
  { id: "s8", label: "Painel do RH abre" },
  { id: "s9", label: "Relatórios abrem e permitem preview" },
  { id: "s10", label: "Operações acessível para Super Admin" },
  { id: "s11", label: "Compliance vê Operações em modo leitura" },
  { id: "s12", label: "Usuário sem papel é bloqueado" },
  { id: "s13", label: "Logout finaliza sessão" },
  { id: "s14", label: "Nenhuma rota válida retorna 404" },
];

const STORAGE_KEY = "mk9.deploy.checklists.v1";

function useLocalChecklist() {
  const [state, setState] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState(JSON.parse(raw) as Record<string, boolean>);
    } catch { /* ignore */ }
  }, []);
  const toggle = (id: string) => {
    setState((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  return { state, toggle };
}

function DeployPage() {
  const { roles, loading } = useSession();
  if (loading) {
    return <AppShell title="Deploy & Go-Live" breadcrumb={["Sistema", "Deploy"]}><Skeleton className="h-40 w-full" /></AppShell>;
  }
  const canRead = roles.includes("super_admin") || roles.includes("compliance");
  if (!canRead) return <Navigate to="/dashboard" replace />;
  const canWrite = roles.includes("super_admin");
  return <DeployContent canWrite={canWrite} />;
}

function DeployContent({ canWrite }: { canWrite: boolean }) {
  return (
    <AppShell title="Deploy & Go-Live Técnico" breadcrumb={["Sistema", "Deploy"]}>
      <p className="-mt-4 text-sm text-muted-foreground">
        Preparação para produção: ambientes, checklist, smoke tests, rollback e observabilidade.
        {canWrite ? "" : " Acesso somente leitura para o perfil Compliance."}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetaCard icon={Rocket} label="Versão" value={`v${APP_VERSION}`} />
        <MetaCard icon={Server} label="Ambiente" value={APP_ENV_LABEL} tone={env.isProduction ? "prod" : "safe"} />
        <MetaCard icon={Activity} label="Build" value={APP_BUILD_DATE ? APP_BUILD_DATE.slice(0, 10) : "não informado"} />
        <MetaCard icon={ShieldCheck} label="Commit" value={APP_COMMIT ? APP_COMMIT.slice(0, 7) : "não informado"} />
      </div>

      <Tabs defaultValue="ambientes">
        <TabsList className="flex-wrap">
          <TabsTrigger value="ambientes"><Globe className="mr-1.5 h-3.5 w-3.5" />Ambientes</TabsTrigger>
          <TabsTrigger value="pre"><ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />Pré-deploy</TabsTrigger>
          <TabsTrigger value="fluxo"><Rocket className="mr-1.5 h-3.5 w-3.5" />Fluxo de deploy</TabsTrigger>
          <TabsTrigger value="smoke"><PlayCircle className="mr-1.5 h-3.5 w-3.5" />Smoke tests</TabsTrigger>
          <TabsTrigger value="pos"><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Pós-deploy</TabsTrigger>
          <TabsTrigger value="rollback"><Undo2 className="mr-1.5 h-3.5 w-3.5" />Rollback</TabsTrigger>
          <TabsTrigger value="dominio"><Lock className="mr-1.5 h-3.5 w-3.5" />Domínio & Segurança</TabsTrigger>
        </TabsList>

        <TabsContent value="ambientes"><Ambientes /></TabsContent>
        <TabsContent value="pre"><Checklist title="Checklist pré-deploy" items={PRE_DEPLOY} readOnly={!canWrite} /></TabsContent>
        <TabsContent value="fluxo"><FluxoDeploy /></TabsContent>
        <TabsContent value="smoke"><Checklist title="Smoke tests (somente leitura em produção)" items={SMOKE} readOnly={!canWrite} banner /></TabsContent>
        <TabsContent value="pos"><Checklist title="Verificações pós-deploy" items={POS_DEPLOY} readOnly={!canWrite} /></TabsContent>
        <TabsContent value="rollback"><Rollback /></TabsContent>
        <TabsContent value="dominio"><Dominio /></TabsContent>
      </Tabs>

      <p className="pb-6 pt-2 text-center text-[11px] text-muted-foreground">
        {buildStamp()}
      </p>
    </AppShell>
  );
}

function MetaCard({ icon: Icon, label, value, tone }: { icon: typeof Server; label: string; value: string; tone?: "prod" | "safe" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{label}</p>
          <Icon className={`h-4 w-4 ${tone === "prod" ? "text-red-500" : tone === "safe" ? "text-emerald-500" : "text-primary"}`} />
        </div>
        <p className="mt-1 text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function Ambientes() {
  const rows = [
    { nome: "Desenvolvimento", uso: "Local e sandbox", banco: "Isolado", auth: "Contas de teste", dados: "Fictícios" },
    { nome: "Homologação", uso: "UAT e E2E", banco: "Exclusivo", auth: "Usuários dedicados", dados: "Anonimizados" },
    { nome: "Produção", uso: "Operação oficial MK9", banco: "Exclusivo", auth: "Contas oficiais", dados: "Reais" },
  ];
  return (
    <Card><CardContent className="p-5 space-y-4">
      <p className="text-sm">
        Cada ambiente possui banco, Storage e Auth exclusivos. Chaves nunca são compartilhadas
        entre homologação e produção. O frontend usa apenas variáveis públicas (<code>VITE_*</code>).
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        {rows.map((r) => (
          <div key={r.nome} className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{r.nome}</p>
              <Badge variant={r.nome === "Produção" ? "destructive" : "outline"}>{r.uso}</Badge>
            </div>
            <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
              <div><dt className="inline font-medium text-foreground">Banco: </dt><dd className="inline">{r.banco}</dd></div>
              <div><dt className="inline font-medium text-foreground">Auth: </dt><dd className="inline">{r.auth}</dd></div>
              <div><dt className="inline font-medium text-foreground">Dados: </dt><dd className="inline">{r.dados}</dd></div>
            </dl>
          </div>
        ))}
      </div>
      <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
        <strong>Nunca</strong> reutilizar service_role, bucket, senha de banco ou tokens
        administrativos entre ambientes. Esses valores permanecem no backend gerenciado.
      </div>
    </CardContent></Card>
  );
}

function Checklist({ title, items, readOnly, banner }: { title: string; items: ChecklistItem[]; readOnly?: boolean; banner?: boolean }) {
  const { state, toggle } = useLocalChecklist();
  const done = items.filter((i) => state[i.id]).length;
  return (
    <Card><CardContent className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ClipboardCheck className="h-4 w-4 text-primary" /> {title}
        </div>
        <Badge variant="outline">{done}/{items.length}</Badge>
      </div>
      {banner && (
        <p className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          Em produção, este checklist deve ser executado <strong>somente em modo leitura</strong>.
          Não crie, edite, importe ou lance registros.
        </p>
      )}
      <ul className="divide-y rounded border">
        {items.map((i) => {
          const checked = !!state[i.id];
          return (
            <li key={i.id} className="flex items-start gap-3 p-3 text-sm">
              <Checkbox
                checked={checked}
                onCheckedChange={() => !readOnly && toggle(i.id)}
                disabled={readOnly}
                aria-label={i.label}
              />
              <div className="flex-1">
                <p className={checked ? "line-through text-muted-foreground" : ""}>{i.label}</p>
                {i.hint && <p className="text-[11px] text-muted-foreground">{i.hint}</p>}
              </div>
              {checked ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-muted-foreground">
        As marcações ficam armazenadas neste navegador. Registros oficiais de deploy vão para <code>audit_logs</code>.
      </p>
    </CardContent></Card>
  );
}

function FluxoDeploy() {
  const steps = [
    "Congelar alterações e confirmar versão",
    "Executar typecheck, testes unitários e smoke",
    "Confirmar snapshot / solicitação de backup",
    "Aplicar migrations no ambiente alvo",
    "Publicar frontend",
    "Validar variáveis públicas e ausência de secrets",
    "Validar autenticação e permissões",
    "Executar smoke tests em produção (leitura)",
    "Executar health check em Operações",
    "Revisar logs sem PII / secrets",
    "Liberar acesso aos usuários",
    "Registrar evidências e responsável",
  ];
  return (
    <Card><CardContent className="p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Rocket className="h-4 w-4 text-primary" /> Fluxo oficial de deploy
      </div>
      <ol className="relative border-s pl-6">
        {steps.map((s, i) => (
          <li key={s} className="mb-4 ms-2">
            <span className="absolute -start-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{i + 1}</span>
            <p className="text-sm">{s}</p>
          </li>
        ))}
      </ol>
    </CardContent></Card>
  );
}

function Rollback() {
  const criterios = [
    "Falha crítica de login",
    "Exposição indevida de dados",
    "RLS incorreta em produção",
    "Indisponibilidade geral",
    "Corrupção de dados",
    "Falha crítica no fluxo de ausência ou lançamento",
    "Erro generalizado de RPC",
  ];
  const passos = [
    "Confirmar critério de ativação e responsável pela decisão",
    "Comunicar impacto e janela aos usuários autorizados",
    "Republicar build anterior estável (rollback do frontend)",
    "Avaliar migrações: preferir migration corretiva; nunca desfazer perda de dados sem snapshot",
    "Restaurar snapshot do banco somente se realmente necessário",
    "Executar smoke tests após rollback",
    "Registrar evidências, decisões e horário em audit_logs",
    "Preservar audit_logs, backup_logs e backup_execution_events",
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card><CardContent className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4 text-amber-500" /> Critérios de ativação
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm">{criterios.map((c) => <li key={c}>{c}</li>)}</ul>
      </CardContent></Card>
      <Card><CardContent className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <RotateCcw className="h-4 w-4 text-primary" /> Passos do rollback
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-sm">{passos.map((c) => <li key={c}>{c}</li>)}</ol>
      </CardContent></Card>
    </div>
  );
}

function Dominio() {
  const items = [
    ["Domínio oficial", "Configurado em Project Settings → Domains"],
    ["HTTPS", "SSL emitido automaticamente pela plataforma"],
    ["Site URL do Auth", "Deve corresponder ao domínio de produção"],
    ["Redirect URLs do Auth", "Incluir apenas domínios permitidos"],
    ["CSP e headers", "Aplicados conforme suportado pela hospedagem"],
    ["Sourcemaps", "Não expor sourcemaps sensíveis em produção"],
    ["Rotas protegidas", "Layout _authenticated com ssr: false"],
    ["Papéis", "Verificados via has_role no backend em toda RPC sensível"],
  ];
  return (
    <Card><CardContent className="p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Lock className="h-4 w-4 text-primary" /> Domínio & Segurança
      </div>
      <ul className="divide-y rounded border">
        {items.map(([k, v]) => (
          <li key={k} className="flex items-center justify-between gap-4 p-3 text-sm">
            <span className="font-medium">{k}</span>
            <span className="text-right text-muted-foreground">{v}</span>
          </li>
        ))}
      </ul>
    </CardContent></Card>
  );
}
