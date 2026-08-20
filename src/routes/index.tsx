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
      PARTE 5B — CORREÇÃO CIRÚRGICA DO assignTicket

      CONTEXTO

      A visibilidade da fila do RH foi corrigida.

      Estado atual:

      Supervisor cria ticket = PASS
      Protocolo SUP-* = PASS
      Auditoria TICKET_CREATED = PASS
      Meus Chamados = PASS
      RH visualiza ticket não atribuído = PASS

      Próximo bloqueio conhecido:

      assignTicket possui AUTH DRIFT.

      OBJETIVO

      Corrigir SOMENTE:

      assignTicket

      Não corrigir ainda:

      sendMessage
      resolveTicket
      reopenTicket
      getUnreadSupportCount
      getAgentMetrics

      ==================================================
      1 — DIAGNOSTICAR assignTicket
      ==================================================

      Localizar assignTicket em:

      src/lib/support.functions.ts

      Confirmar se utiliza padrão incorreto de autenticação server-side, como:

      supabase.auth.getUser()

      via cliente frontend.

      Reportar:

      AUTH_DRIFT:
      SIM/NÃO

      ROOT_CAUSE:
      [...]

      ==================================================
      2 — USAR PADRÃO CANÔNICO
      ==================================================

      Se confirmado:

      aplicar:

      requireSupabaseAuth

      context.userId

      context.supabase

      Reutilizar exatamente o middleware canônico já homologado em:

      createTicket
      getTickets

      NÃO criar novo middleware.

      ==================================================
      3 — IDENTIDADE DO ATENDENTE
      ==================================================

      O responsável pelo chamado deve ser derivado server-side.

      assigned_user_id deve corresponder ao usuário RH autenticado que executou
      "Assumir chamado".

      NÃO confiar em assigned_user_id arbitrário enviado pelo frontend.

      ==================================================
      4 — AUTORIZAÇÃO
      ==================================================

      Somente perfil autorizado a atender pode executar assignment.

      Validar pelo menos:

      RH autorizado:
      PASS

      Super Admin:
      PASS conforme regra existente

      Supervisor:
      BLOCKED

      Usuário não autenticado:
      BLOCKED

      Não ampliar RBAC.

      ==================================================
      5 — CONCORRÊNCIA
      ==================================================

      Preservar proteção contra dois atendentes assumirem o mesmo chamado.

      Cenário:

      Ticket:
      assigned_user_id = NULL

      RH A tenta assumir.
      RH B tenta assumir praticamente ao mesmo tempo.

      Esperado:

      somente um responsável final.

      O segundo deve receber mensagem funcional equivalente a:

      "Este chamado já foi assumido por outro atendente."

      Não criar dois assignments lógicos.

      ==================================================
      6 — EVENTO DE AUDITORIA
      ==================================================

      Após assignment válido:

      gerar/preservar evento:

      TICKET_ASSIGNED

      Confirmar:

      ticket_id correto
      actor_user_id correto
      assigned_user_id correto
      timestamp correto

      Esperado:

      1 evento lógico.

      ==================================================
      7 — TESTE REAL CONTROLADO
      ==================================================

      Usar ticket de homologação não atribuído.

      Como RH:

      Central de Suporte
      → localizar ticket
      → Assumir chamado

      Validar:

      UI:
      PASS

      DATABASE:
      assigned_user_id correto

      STATUS:
      conforme contrato existente

      AUDIT:
      TICKET_ASSIGNED = 1

      ==================================================
      8 — RLS
      ==================================================

      NÃO desabilitar RLS.

      NÃO utilizar Service Role no frontend.

      Se assignment precisar de policy específica, primeiro verificar a policy
      existente e alterar somente se houver necessidade comprovada.

      Preservar fail-closed.

      ==================================================
      9 — NÃO CORRIGIR OUTRAS FUNÇÕES
      ==================================================

      Mesmo que sendMessage ou resolveTicket estejam quebradas:

      NÃO corrigir nesta parte.

      Esta etapa termina assim que assignment estiver validado.

      ==================================================
      GUARDRAILS
      ==================================================

      NÃO alterar:

      src/routes/index.tsx
      createTicket
      getTickets
      gerador SUP-*
      TICKET_CREATED
      FAB
      chat
      Base de Conhecimento
      Copiloto
      Incidentes
      Nova Ausência
      Retificação
      Ocorrência
      Processamento
      AI_KILL_SWITCH
      Kill Switch operacional

      ==================================================
      RELATÓRIO FINAL
      ==================================================

      PARTE 5B — assignTicket

      AUTH_DRIFT:
      SIM/NÃO

      ROOT_CAUSE:
      [...]

      requireSupabaseAuth:
      SIM/NÃO

      context.userId:
      SIM/NÃO

      context.supabase:
      SIM/NÃO

      Frontend Auth Removed:
      SIM/NÃO

      --------------------------------
      AUTHORIZATION
      --------------------------------

      RH:
      PASS/FAIL

      Super Admin:
      PASS/FAIL

      Supervisor:
      BLOCKED/FAIL

      Anonymous:
      BLOCKED/FAIL

      --------------------------------
      ASSIGNMENT
      --------------------------------

      Ticket Visible:
      PASS/FAIL

      Assign Action:
      PASS/FAIL

      Assigned User Match:
      PASS/FAIL

      Database:
      PASS/FAIL

      Status:
      PASS/FAIL

      --------------------------------
      CONCURRENCY
      --------------------------------

      Single Winner:
      PASS/FAIL

      Duplicate Assignment:
      SIM/NÃO

      --------------------------------
      AUDIT
      --------------------------------

      TICKET_ASSIGNED:
      PASS/FAIL

      Audit Count:
      [...]

      Actor Match:
      PASS/FAIL

      --------------------------------
      SECURITY
      --------------------------------

      RLS:
      PASS/FAIL

      RBAC:
      PASS/FAIL

      Service Role:
      NÃO/SIM

      --------------------------------
      BUILD
      --------------------------------

      TypeScript:
      PASS/FAIL

      Build:
      PASS/FAIL

      --------------------------------
      DECISÃO
      --------------------------------

      ASSIGN_TICKET_FIXED:
      SIM/NÃO

      READY_FOR_SENDMESSAGE_FIX:
      SIM/NÃO

      PARAR.

      Não iniciar a próxima parte automaticamente.
    </div>
  ),
});
