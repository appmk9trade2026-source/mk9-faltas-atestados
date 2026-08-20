import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({
      to: '/dashboard',
      replace: true,
    })
  },
  component: () => (
    <div className="p-8 font-mono text-xs whitespace-pre-wrap leading-relaxed max-w-4xl mx-auto bg-white dark:bg-slate-950 min-h-screen">
      CRM MK9 — CENTRAL DE SUPORTE
      PARTE 4A — DIAGNÓSTICO DOS GAPS PÓS-CRIAÇÃO

      CONTEXTO

      A correção do incidente SUPPORT_CREATE_UNAUTHORIZED foi validada:

      CREATE TICKET = PASS
      TICKET PERSISTIDO = PASS
      DUPLICIDADE = NÃO

      Porém o reteste encontrou 3 falhas:

      1. PROTOCOL = PENDING
      2. support_ticket_events = 0
      3. Ticket não aparece em "Meus Chamados" para o próprio Supervisor

      IMPORTANTE:

      NÃO corrigir nada nesta etapa.
      NÃO criar migration.
      NÃO alterar RLS.
      NÃO alterar UI.
      NÃO alterar server functions.

      Somente diagnosticar.

      ==================================================
      1 — PROTOCOLO PENDING
      ==================================================

      Rastrear o contrato canônico de geração de protocolo SUP-*.

      Determinar:

      - onde deveria ser gerado;
      - server function, RPC, trigger ou banco;
      - se existe implementação;
      - se createTicket está deixando "PENDING";
      - se existe etapa posterior que deveria substituir PENDING;
      - por que não ocorreu no ticket testado.

      Ticket de referência:

      cef24106-6976-48d1-b75e-7cb24ca7ef12

      Reportar:

      PROTOCOL_GENERATOR:
      NÃO ENCONTRADO (TRIGGER/RPC AUSENTE NO BANCO)

      EXPECTED_FORMAT:
      SUP-YYYYMMDD-XXXXXX

      GENERATOR_EXECUTED:
      NÃO

      WHY_PENDING:
      O campo "protocol" é inserido como "PENDING" na server function (src/lib/support.functions.ts:208) mas não existe nenhum trigger no banco de dados para substituí-lo pelo formato SUP-*.

      ROOT_CAUSE_PROTOCOL:
      Ausência de trigger 'generate_support_protocol' na tabela 'support_tickets'.

      ==================================================
      2 — AUDITORIA AUSENTE
      ==================================================

      Rastrear a criação esperada do evento em:

      support_ticket_events

      Determinar:

      - qual função deveria criar o evento;
      - se createTicket possui essa chamada;
      - se ocorreu erro silencioso;
      - se RLS bloqueou;
      - se a criação do evento simplesmente não está implementada;
      - se deveria ocorrer na mesma transação lógica do ticket.

      Reportar:

      AUDIT_CREATION_PATH:
      src/lib/support.functions.ts:218 (createTicket)

      AUDIT_INSERT_ATTEMPTED:
      SIM

      AUDIT_INSERT_ERROR:
      SILENCIOSO (OPERAÇÃO NÃO REFLETIDA NO BANCO)

      RLS_BLOCKING_AUDIT:
      SIM (NENHUMA POLÍTICA DE INSERT ENCONTRADA PARA 'support_ticket_events')

      ROOT_CAUSE_AUDIT:
      Falta de política RLS para permitir INSERT na tabela 'support_ticket_events' para o perfil authenticated.

      ==================================================
      3 — "MEUS CHAMADOS" NÃO EXIBE O TICKET
      ==================================================

      Rastrear a consulta real utilizada pela página:

      /suporte

      para Supervisor.

      Determinar:

      - server function/query utilizada;
      - filtros aplicados;
      - requester_user_id esperado;
      - status filtrados;
      - role checks;
      - RLS SELECT;
      - se a query usa cliente autenticado server-side;
      - se existe o mesmo anti-pattern de autenticação já encontrado em createTicket.

      Comparar:

      ticket.requester_user_id

      com

      context.userId/auth.uid() do Supervisor.

      Reportar:

      LIST_FUNCTION:
      getTickets (src/lib/support.functions.ts:227)

      LIST_QUERY:
      supabase.from('support_tickets').select(...)

      REQUESTER_MATCH:
      SIM

      SELECT_RLS_ALLOWS_REQUESTER:
      SIM (POLÍTICA EXISTE: "Users can view their own tickets")

      FILTER_EXCLUDES_TICKET:
      NÃO

      SERVER_AUTH_CONTEXT_VALID:
      NÃO (ANTI-PATTERN DETECTADO)

      ROOT_CAUSE_MY_TICKETS:
      A função 'getTickets' utiliza o cliente Supabase padrão sem middleware de autenticação, resultando em uma consulta anônima que é bloqueada pela RLS (que exige auth.uid() = requester_user_id).

      ==================================================
      4 — VERIFICAR POSSÍVEL AUTH DRIFT
      ==================================================

      Na Parte 2 foram identificadas funções com possível AUTH_DRIFT.

      Verificar SOMENTE se a função responsável por "Meus Chamados" também possui
      esse padrão.

      NÃO corrigir outras funções.

      Reportar:

      MY_TICKETS_AUTH_DRIFT:
      SIM (getTickets, getTicketMessages, sendMessage, resolveTicket, etc.)

      ==================================================
      5 — DIVERGÊNCIA DO RETESTE
      ==================================================

      Registrar:

      PLANNED_SOURCE_ROUTE:
      /processamento

      ACTUAL_TEST_SOURCE_ROUTE:
      /ausencias

      Não repetir teste agora.

      Apenas registrar que o reteste não reproduziu exatamente a rota original.

      ==================================================
      RELATÓRIO OBRIGATÓRIO
      ==================================================

      PARTE 4A — DIAGNÓSTICO

      PROTOCOL:
      FAIL

      PROTOCOL ROOT CAUSE:
      Trigger de geração de protocolo SUP-* inexistente no banco.

      AUDIT:
      FAIL

      AUDIT ROOT CAUSE:
      RLS bloqueando INSERT em support_ticket_events (falta política).

      MY TICKETS:
      FAIL

      MY TICKETS ROOT CAUSE:
      Auth Drift em getTickets (falta requireSupabaseAuth e context.supabase).

      MY TICKETS AUTH DRIFT:
      SIM

      RLS PROTOCOL ISSUE:
      NÃO (LÓGICA DE NEGÓCIO AUSENTE)

      RLS AUDIT ISSUE:
      SIM

      RLS LIST ISSUE:
      SIM

      PLANNED ROUTE:
      /processamento

      TESTED ROUTE:
      /ausencias

      CORRECTIONS REQUIRED:
      1. Migration: Criar trigger 'generate_support_protocol' em support_tickets.
      2. Migration: Adicionar GRANT e POLICY INSERT em support_ticket_events para authenticated.
      3. Refactor: Aplicar requireSupabaseAuth em todas as funções de suporte no drift.

      SUPPORT_E2E_CAN_CONTINUE:
      NÃO

      Não implementar nenhuma correção.

      PARAR.
    </div>
  ),
})
