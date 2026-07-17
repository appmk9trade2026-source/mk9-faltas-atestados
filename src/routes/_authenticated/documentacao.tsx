import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/hooks/use-session";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/documentacao")({
  head: () => ({ meta: [{ title: "Documentação Técnica · CRM MK9" }] }),
  component: DocPage,
});

function DocPage() {
  const { roles, loading } = useSession();
  if (loading) return <AppShell title="Documentação" breadcrumb={["Sistema","Documentação"]}><Skeleton className="h-40 w-full" /></AppShell>;
  if (!roles.includes("super_admin")) return <Navigate to="/dashboard" replace />;

  return (
    <AppShell title="Documentação Técnica" breadcrumb={["Sistema", "Documentação"]}>
      <p className="-mt-4 text-sm text-muted-foreground">
        Referência viva sobre arquitetura, permissões, auditoria, backup e testes.
      </p>

      <Tabs defaultValue="arq">
        <TabsList className="flex-wrap">
          <TabsTrigger value="arq">Arquitetura</TabsTrigger>
          <TabsTrigger value="tabelas">Tabelas & RPCs</TabsTrigger>
          <TabsTrigger value="perfis">Permissões</TabsTrigger>
          <TabsTrigger value="audit">Auditoria</TabsTrigger>
          <TabsTrigger value="backup">Backup & Recuperação</TabsTrigger>
          <TabsTrigger value="testes">Checklist de Testes</TabsTrigger>
        </TabsList>

        <TabsContent value="arq"><Doc><Arq /></Doc></TabsContent>
        <TabsContent value="tabelas"><Doc><Tabelas /></Doc></TabsContent>
        <TabsContent value="perfis"><Doc><Perfis /></Doc></TabsContent>
        <TabsContent value="audit"><Doc><Audit /></Doc></TabsContent>
        <TabsContent value="backup"><Doc><Backup /></Doc></TabsContent>
        <TabsContent value="testes"><Doc><Testes /></Doc></TabsContent>
      </Tabs>
    </AppShell>
  );
}

function Doc({ children }: { children: React.ReactNode }) {
  return (
    <Card><CardContent className="prose prose-sm max-w-none p-6 dark:prose-invert">{children}</CardContent></Card>
  );
}

function Arq() {
  return (
    <>
      <h2>Arquitetura</h2>
      <ul>
        <li><b>Frontend:</b> React 19 + TanStack Start (Vite 7), TanStack Router e Query, TailwindCSS v4, shadcn/ui, Recharts.</li>
        <li><b>Backend:</b> Lovable Cloud (Postgres gerenciado), Row Level Security, RPCs SECURITY INVOKER/DEFINER, triggers de negócio e auditoria.</li>
        <li><b>Autenticação:</b> Supabase Auth (e-mail/senha). Papéis em <code>public.user_roles</code> validados via função <code>public.has_role()</code>.</li>
        <li><b>Storage:</b> bucket privado <code>atestados</code> (anexos de ausências), acesso somente via URL assinada.</li>
        <li><b>Integrações:</b> OpenRouter para sugestões de IA no formulário de ausências.</li>
      </ul>
      <h3>Fluxo Operacional</h3>
      <ol>
        <li>Colaborador registra ausência via RH/Supervisor → status inicial <b>PENDENTE</b>.</li>
        <li>RH revisa no <b>Painel do RH</b>, gera <b>Comunicação</b> e marca como <b>LANÇADO</b>.</li>
        <li>Dados alimentam <b>Dashboard Executivo</b> e <b>Relatórios Oficiais</b>.</li>
        <li>Todas as alterações são gravadas em <code>audit_logs</code>.</li>
      </ol>
    </>
  );
}

function Tabelas() {
  return (
    <>
      <h2>Tabelas Principais</h2>
      <ul>
        <li><code>empresas</code>, <code>projetos</code> — cadastros base (soft-delete via <code>ativo</code>).</li>
        <li><code>colaboradores</code> — matrícula única por empresa + dados de contato e supervisão.</li>
        <li><code>ausencias</code> — registros com snapshot imutável de tipo/período; status PENDENTE ↔ LANCADO.</li>
        <li><code>tipos_ausencia</code>, <code>opcoes_periodo_ausencia</code>, <code>tipo_ausencia_opcoes_periodo</code>, <code>categorias_ausencia</code> — catálogo oficial.</li>
        <li><code>comunicacoes</code> — mensagens ao colaborador; imutáveis após <b>ENVIADO</b>; nunca excluídas.</li>
        <li><code>importacoes</code> — histórico de importações em massa.</li>
        <li><code>audit_logs</code> — trilha imutável (UPDATE/DELETE bloqueados por trigger).</li>
        <li><code>profiles</code>, <code>user_roles</code> — dados de usuário e papéis.</li>
      </ul>
      <h3>RPCs Relevantes</h3>
      <ul>
        <li><code>dashboard_metrics</code> — agregação para o Dashboard Executivo.</li>
        <li><code>rel_absenteismo</code>, <code>rel_atestados</code>, <code>rel_faltas</code>, <code>rel_licencas</code>, <code>rel_afastamentos_inss</code>, <code>rel_medidas_administrativas</code>, <code>rel_comunicacoes</code>, <code>rel_auditoria</code> — relatórios oficiais.</li>
        <li><code>search_audit_logs</code>, <code>audit_kpis</code> — módulo de auditoria.</li>
        <li><code>import_colaboradores_bulk</code> — importação transacional.</li>
        <li><code>saude_sistema</code> — indicadores de saúde (Super Admin).</li>
        <li><code>has_role</code>, <code>bootstrap_first_super_admin</code>, <code>log_audit_event</code>, <code>handle_new_user</code> — infraestrutura.</li>
      </ul>
      <h3>Triggers Chave</h3>
      <ul>
        <li><code>tg_audit_row</code> — captura CREATE/UPDATE/DELETE_LOGICO/MUDANCA_STATUS.</li>
        <li><code>tg_audit_logs_immutable</code> — impede alteração/exclusão de logs.</li>
        <li><code>tg_ausencias_valida</code>, <code>tg_ausencias_valida_tipo_periodo</code> — regras + snapshot histórico.</li>
        <li><code>tg_colaboradores_normalize</code>, <code>tg_colaboradores_valida_vinculo</code>.</li>
        <li><code>tg_comunicacoes_biu</code>, <code>tg_comunicacoes_no_delete</code>.</li>
        <li><code>tg_projetos_normalize</code>, <code>tg_projetos_valida_empresa_ativa</code>.</li>
      </ul>
    </>
  );
}

function Perfis() {
  return (
    <>
      <h2>Permissões por Perfil</h2>
      <table>
        <thead><tr><th>Módulo</th><th>Super Admin</th><th>RH</th><th>Supervisor</th><th>Compliance</th></tr></thead>
        <tbody>
          <tr><td>Dashboard</td><td>✔</td><td>✔</td><td>✔ (leitura)</td><td>✔ (leitura)</td></tr>
          <tr><td>Nova Ausência</td><td>✔</td><td>✔</td><td>✔</td><td>—</td></tr>
          <tr><td>Ausências</td><td>✔</td><td>✔</td><td>✔</td><td>✔</td></tr>
          <tr><td>Painel do RH</td><td>✔</td><td>✔</td><td>—</td><td>—</td></tr>
          <tr><td>Colaboradores</td><td>✔</td><td>✔</td><td>✔</td><td>✔ (leitura)</td></tr>
          <tr><td>Importações</td><td>✔</td><td>✔</td><td>—</td><td>—</td></tr>
          <tr><td>Comunicações</td><td>✔</td><td>✔</td><td>✔</td><td>✔ (leitura)</td></tr>
          <tr><td>Relatórios</td><td>✔</td><td>✔</td><td>—</td><td>✔</td></tr>
          <tr><td>Configurações</td><td>✔</td><td>parcial</td><td>—</td><td>—</td></tr>
          <tr><td>Auditoria</td><td>✔</td><td>parcial</td><td>—</td><td>✔</td></tr>
          <tr><td>Sistema (Saúde / Docs)</td><td>✔</td><td>—</td><td>—</td><td>—</td></tr>
        </tbody>
      </table>
      <p>Toda restrição é aplicada em duas camadas: RLS no banco e visibilidade do menu.</p>
    </>
  );
}

function Audit() {
  return (
    <>
      <h2>Estratégia de Auditoria</h2>
      <ul>
        <li><b>Imutabilidade:</b> tabela <code>audit_logs</code> possui trigger que bloqueia UPDATE/DELETE.</li>
        <li><b>Cobertura automática:</b> trigger <code>tg_audit_row</code> em empresas, projetos, colaboradores, ausências, comunicações e importações.</li>
        <li><b>Eventos manuais:</b> LOGIN, LOGOUT (via <code>use-session</code>) e EXPORTAÇÃO (Relatórios).</li>
        <li><b>Consulta:</b> RPC <code>search_audit_logs</code> paginada + KPIs 24h via <code>audit_kpis</code>.</li>
        <li><b>Snapshots:</b> ausências guardam <code>tipo_ausencia_codigo/nome</code> e <code>opcao_periodo_codigo/nome</code> no INSERT; alterações posteriores nos catálogos não alteram o histórico.</li>
      </ul>
      <h3>Versionamento</h3>
      <p>Migrações versionadas em <code>supabase_migrations.schema_migrations</code>. Versão da aplicação em <code>src/lib/app-meta.ts</code>. Convenção Semver (MAJOR.MINOR.PATCH).</p>
    </>
  );
}

function Backup() {
  return (
    <>
      <h2>Backup e Recuperação</h2>
      <h3>Rotina Recomendada</h3>
      <ul>
        <li><b>Diário:</b> exportação automática do banco pela plataforma Lovable Cloud (retenção padrão).</li>
        <li><b>Semanal:</b> exportação manual (Cloud → Advanced settings → Export data) armazenada fora do provedor.</li>
        <li><b>Mensal:</b> validação de restauração em ambiente de homologação.</li>
      </ul>
      <h3>Procedimento de Recuperação</h3>
      <ol>
        <li>Identificar snapshot alvo (data + horário).</li>
        <li>Solicitar restauração via console Lovable Cloud OU importar dump em ambiente novo.</li>
        <li>Executar migrações pendentes: <code>supabase_migrations.schema_migrations</code> deve refletir a versão do código.</li>
        <li>Reconfigurar segredos (OPENROUTER_API_KEY, chaves Supabase gerenciadas pela plataforma).</li>
        <li>Rodar smoke tests (checklist Testes).</li>
      </ol>
      <h3>Validação Pós-Restauração</h3>
      <ul>
        <li>Login com super_admin.</li>
        <li>Verificar contagens em <b>Saúde do Sistema</b> vs. produção anterior.</li>
        <li>Consultar 10 registros aleatórios de <code>ausencias</code> e conferir integridade de snapshot.</li>
        <li>Executar <b>Relatório de Auditoria</b> das últimas 24h antes do incidente.</li>
      </ul>
      <h3>Checklist Operacional</h3>
      <ul>
        <li>[ ] Backup diário concluído com sucesso.</li>
        <li>[ ] Exportação semanal salva off-site.</li>
        <li>[ ] Teste mensal de restauração executado.</li>
        <li>[ ] Auditoria sem eventos de <code>ACESSO_NEGADO</code> anormais.</li>
        <li>[ ] Página <b>Saúde</b> sem alertas.</li>
      </ul>
    </>
  );
}

function Testes() {
  return (
    <>
      <h2>Checklist de Testes Manuais</h2>
      <h3>Autenticação</h3>
      <ul>
        <li>Login com credencial válida (sucesso).</li>
        <li>Login com senha errada (falha, mensagem clara).</li>
        <li>Logout limpa sessão e redireciona para /auth.</li>
      </ul>
      <h3>RLS</h3>
      <ul>
        <li>Supervisor NÃO acessa Painel do RH.</li>
        <li>Compliance NÃO edita comunicações.</li>
        <li>Requisição direta à API sem token retorna 401.</li>
      </ul>
      <h3>CRUDs</h3>
      <ul>
        <li>Criar/editar Empresa · Projeto · Colaborador.</li>
        <li>Inativar Empresa impede ativação de Projeto vinculado.</li>
        <li>Nova Ausência com anexo &gt;10MB é rejeitada.</li>
      </ul>
      <h3>Importação</h3>
      <ul>
        <li>Upload de CSV válido: preview → confirmar → contagens corretas.</li>
        <li>CSV com matrícula duplicada respeita opção "atualizar existentes".</li>
        <li>Log de importação aparece em Histórico.</li>
      </ul>
      <h3>Dashboard & Relatórios</h3>
      <ul>
        <li>Filtros de período, empresa e categoria refletem nos gráficos.</li>
        <li>Cada relatório oficial gera XLSX, CSV e PDF com cabeçalho MK9 e paginação.</li>
        <li>Auditoria registra a EXPORTAÇÃO.</li>
      </ul>
      <h3>Auditoria & Comunicações</h3>
      <ul>
        <li>Alterar status de ausência gera log <code>MUDANCA_STATUS</code>.</li>
        <li>Tentativa de UPDATE em audit_logs falha.</li>
        <li>Comunicação ENVIADA fica bloqueada para edição/exclusão.</li>
      </ul>
      <h3>Exportações</h3>
      <ul>
        <li>Painel RH exporta Excel com colunas Categoria e Tipo Oficial.</li>
        <li>Relatório PDF pagina corretamente para 100+ linhas.</li>
      </ul>
    </>
  );
}
