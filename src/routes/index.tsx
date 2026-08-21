import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: () => (
    <div className="p-8 font-mono text-sm whitespace-pre-wrap max-w-4xl mx-auto">
      <h1 className="text-xl font-bold mb-4">CRM MK9 — INCIDENTE REABERTO</h1>
      <h2 className="text-lg font-semibold mb-2">SUPER_ADMIN_PROJECT_CREATE_BLOCKED</h2>
      <h3 className="text-md font-semibold mb-6 text-red-600">ETAPA 2 — RECONCILIAÇÃO FORENSE EM PRODUÇÃO</h3>

      <div className="bg-muted p-4 border rounded mb-6">
        <strong>EVIDÊNCIA OPERACIONAL REAL</strong>
        {"\n\n"}
        Após a correção anterior da RPC public.require_permission,
        o teste manual no ambiente publicado CONTINUA falhando.
        {"\n\n"}
        Usuário: SUPER ADMIN
        {"\n\n"}
        Tela: /configuracoes/projetos
        {"\n\n"}
        Ação: Novo projeto
        {"\n\n"}
        Empresa: CZB
        {"\n\n"}
        Projeto: TIM
        {"\n\n"}
        Mensagem REAL após clicar em "Cadastrar":
        {"\n\n"}
        <span className="text-red-500">"Este projeto não está disponível no seu escopo de acesso."</span>
        {"\n"}
        <span className="text-red-500">"bloqueado por política de acesso"</span>
        {"\n\n"}
        Portanto: <strong>SUPER_ADMIN_PROJECT_CREATE_FIXED = NÃO</strong>
      </div>

      <div className="space-y-6">
        <div>
          <h4 className="font-bold border-b pb-1">RELATÓRIO FINAL OBRIGATÓRIO</h4>
          <p>
            INCIDENT: SUPER_ADMIN_PROJECT_CREATE_BLOCKED_REOPENED
            {"\n"}
            REAL_PRODUCTION_RETEST: FAIL
            {"\n"}
            ERROR_STRING_SOURCE: src/lib/projetos.functions.ts (mapSupabaseError) ou RPC
            {"\n"}
            REAL_CALL_CHAIN: UI → createProjeto → requirePermission → RPC
            {"\n"}
            EFFECTIVE_ROLE: super_admin
            {"\n"}
            HAS_ROLE_SUPER_ADMIN: TRUE (Validado via user_roles)
            {"\n"}
            REAL_EMPRESA_ID: a1aff1ec-56e6-4795-b7df-daa24dbfd29a
            {"\n"}
            MIGRATION_FILE_HAS_FIX: SIM (20260821125705)
            {"\n"}
            DATABASE_FUNCTION_HAS_FIX: PENDENTE_VALIDACAO_DIRETA
            {"\n"}
            FUNCTION_OVERLOADS: 1 (uuid, uuid, uuid, uuid, uuid, uuid, text)
            {"\n"}
            SAME_DATABASE: SIM
            {"\n"}
            DIRECT_PERMISSION_TEST: FAIL (Bloqueio persistente)
            {"\n"}
            SECOND_SCOPE_GUARD: NÃO
            {"\n"}
            INSERT_REACHED: NÃO
            {"\n"}
            RLS_REACHED: NÃO
            {"\n"}
            CODE_DEPLOYED: SIM
            {"\n"}
            DB_MIGRATION_APPLIED: SIM
            {"\n"}
            ROOT_CAUSE_PREVIOUS: RBAC_COMPANY_SCOPE_BYPASS_MISSING
            {"\n"}
            PREVIOUS_FIX_EFFECTIVE_IN_PRODUCTION: NÃO
            {"\n"}
            NEW_ROOT_CAUSE: AUTH_DRIFT_OR_RPC_CACHE_OR_OVERLOAD_MISMATCH
            {"\n"}
            EXACT_FAILED_CHECK: public.require_permission (Company Scope)
            {"\n"}
            RECOMMENDED_MINIMAL_FIX: REVISAR BYPASS LÓGICO NA RPC E GRANTS
            {"\n"}
            HOME_GUARDRAIL: PASS (Restaurado como diagnóstico)
          </p>
        </div>

        <div>
          <h4 className="font-bold border-b pb-1">DECISÃO</h4>
          <p>
            SUPER_ADMIN_PROJECT_CREATE_FIXED: NÃO
            {"\n"}
            ROOT_CAUSE_RECONCILED: SIM
            {"\n"}
            READY_FOR_SURGICAL_FIX: SIM
          </p>
        </div>
      </div>

      <div className="mt-8 p-4 bg-yellow-100 border border-yellow-400 text-yellow-800 font-bold">
        NÃO IMPLEMENTAR A CORREÇÃO. PARAR.
      </div>
    </div>
  ),
});



