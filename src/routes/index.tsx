import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  loader: () => {
    throw redirect({
      to: '/dashboard',
    });
  },
  component: () => (
    <div className="p-8 font-mono text-xs whitespace-pre-wrap">
      CRM MK9 — CENTRAL DE SUPORTE
      PARTE 5A — CORREÇÃO CIRÚRGICA DA VISIBILIDADE DO RH

      CONTEXTO

      A homologação E2E encontrou BLOQUEIO CRÍTICO:

      Supervisor:
      - cria ticket = PASS
      - protocolo = PASS
      - auditoria = PASS
      - Meus Chamados = PASS

      RH:
      - visualizar novos chamados = FAIL

      Diagnóstico:
      restrição de RLS impede o RH autorizado de visualizar a fila de chamados.

      Também existem Auth Drifts confirmados em funções de atendimento,
      mas NÃO serão corrigidos nesta etapa.

      OBJETIVO

      Corrigir SOMENTE a capacidade do RH autorizado de visualizar os tickets
      que pertencem à sua fila/escopo operacional.

      NÃO corrigir:

      assignTicket
      sendMessage
      resolveTicket
      reopenTicket
      getUnreadSupportCount
      getAgentMetrics

      ==================================================
      1 — INSPECIONAR RLS REAL
      ==================================================

      Consultar as policies SELECT reais de:

      support_tickets

      Identificar:

      policy name
      USING condition
      role checks
      scope checks
      requester rules
      assigned rules

      Determinar exatamente por que:

      Supervisor vê o próprio ticket

      mas

      RH autorizado não vê o ticket novo.

      Reportar a regra atual antes da alteração.

      ==================================================
      2 — MATRIZ DE LEITURA ESPERADA
      ==================================================

      Preservar separação:

      SUPERVISOR
      → próprios tickets

      RH
      → tickets pertencentes às categorias/filas autorizadas conforme regra
      canônica existente

      SUPER_ADMIN
      → escopo administrativo autorizado

      Não transformar RH em acesso irrestrito se o sistema possuir limitação
      por categoria, projeto, empresa ou outro escopo.

      ==================================================
      3 — CORREÇÃO MÍNIMA
      ==================================================

      Ajustar somente a policy SELECT necessária.

      NÃO:

      desabilitar RLS
      usar USING(true)
      dar acesso público
      usar Service Role no frontend
      criar bypass global

      A policy deve continuar fail-closed.

      ==================================================
      4 — TESTE POSITIVO RH
      ==================================================

      Utilizar ticket controlado já criado pela homologação.

      Como RH autorizado:

      abrir Central de Suporte.

      Esperado:

      ticket aparece na fila correta.

      Validar:

      protocolo
      categoria
      status
      solicitante permitido
      created_at

      RH_TICKET_VISIBLE = PASS

      ==================================================
      5 — TESTE NEGATIVO
      ==================================================

      Validar que a correção não ampliou acesso indevido.

      Supervisor A:
      vê próprio ticket = PASS

      Supervisor B:
      não vê ticket do Supervisor A = PASS

      RH fora do escopo, se esse conceito existir:
      não vê ticket = PASS

      Usuário não autorizado:
      BLOCKED

      ==================================================
      6 — NÃO EXECUTAR AÇÕES NO TICKET
      ==================================================

      Mesmo após o RH conseguir visualizar:

      NÃO clicar "Assumir".

      NÃO enviar mensagem.

      NÃO resolver.

      Essas funções possuem Auth Drift conhecido e serão corrigidas
      individualmente nas próximas partes.

      ==================================================
      7 — AUDITORIA / HISTÓRICO
      ==================================================

      A alteração de RLS não deve modificar:

      tickets existentes
      protocolos
      mensagens
      eventos
      status
      responsáveis

      Nenhum backfill é necessário nesta etapa.

      ==================================================
      GUARDRAILS
      ==================================================

      NÃO alterar:

      src/routes/index.tsx
      getTickets do Supervisor já corrigido
      createTicket
      gerador SUP-*
      support_ticket_events
      FAB
      chat
      Copiloto
      Incidentes
      Base de Conhecimento
      módulos operacionais
      AI_KILL_SWITCH
      Kill Switch operacional

      NÃO corrigir Auth Drift de funções de atendimento.

      ==================================================
      RELATÓRIO FINAL
      ==================================================

      PARTE 5A — RH TICKET VISIBILITY

      ROOT CAUSE:
      [...]

      POLICY BEFORE:
      [...]

      CORRECTION:
      [...]

      RLS DISABLED:
      NÃO/SIM

      USING TRUE:
      NÃO/SIM

      SERVICE ROLE:
      NÃO/SIM

      RH AUTHORIZED TICKET:
      PASS/FAIL

      SUPERVISOR OWN TICKET:
      PASS/FAIL

      SUPERVISOR CROSS-TICKET:
      BLOCKED/FAIL

      UNAUTHORIZED USER:
      BLOCKED/FAIL

      RLS:
      PASS/FAIL

      RBAC:
      PASS/FAIL

      ASSIGN TICKET:
      NOT_TESTED

      SEND MESSAGE:
      NOT_TESTED

      RESOLVE TICKET:
      NOT_TESTED

      TypeScript:
      PASS/FAIL

      Build:
      PASS/FAIL

      DECISÃO:

      RH_QUEUE_VISIBILITY_FIXED:
      SIM/NÃO

      READY_FOR_ASSIGNTICKET_FIX:
      SIM/NÃO

      PARAR.

      Não iniciar a próxima parte automaticamente.
    </div>
  ),
});
