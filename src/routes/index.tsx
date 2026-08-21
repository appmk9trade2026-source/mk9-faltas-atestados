import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: () => (
    <div className="p-8 font-mono text-sm leading-relaxed whitespace-pre-wrap max-w-4xl mx-auto bg-card border rounded-lg shadow-sm">
      CRM MK9 — INCIDENTE P1
      RETIFICACAO_OPERACIONAL_REOPENED
      PARTE 1B — IDENTIFICAR O PRIMEIRO STAGE QUE FALHA

      CONTEXTO

      Já foi confirmado:

      RPC retificar_ausencia:
      EXECUTE = PASS

      SECURITY DEFINER:
      SIM

      ausencia_retificacoes:
      SCHEMA INTEGRO

      AUTH DRIFT:
      NÃO IDENTIFICADO

      Esses resultados NÃO encerram o diagnóstico.

      Ainda precisamos descobrir exatamente onde a operação real falha.

      OBJETIVO DESTA PARTE

      Executar uma retificação controlada no ambiente operacional e identificar
      o PRIMEIRO STAGE que falha.

      NÃO corrigir nada.

      ==================================================
      1 — REPRODUZIR A FALHA REAL
      ==================================================

      Executar UMA retificação controlada de registro elegível.

      Preferir cenário que já apresentou erro anteriormente.

      Capturar:

      ausencia_id
      protocolo original
      tipo atual
      novo tipo
      período
      horario_inicio/horario_fim quando aplicável
      documento quando aplicável

      Não expor PII no relatório.

      ==================================================
      2 — STAGES OBRIGATÓRIOS
      ==================================================

      Rastrear sequencialmente:

      STAGE A:
      UI submit

      STAGE B:
      upload/documento

      STAGE C:
      Zod/schema

      STAGE D:
      server function

      STAGE E:
      auth/RBAC

      STAGE F:
      chamada RPC

      STAGE G:
      INSERT em ausencia_retificacoes

      STAGE H:
      UPDATE em ausencias

      STAGE I:
      audit event

      STAGE J:
      response handler/frontend

      Registrar:

      PASS / FAIL / NOT_REACHED

      para cada stage.

      ==================================================
      3 — CAPTURAR ERRO BRUTO
      ==================================================

      Antes de sanitização/toast:

      RAW_ERROR_CODE:
      [...]

      RAW_ERROR_MESSAGE_SAFE:
      [...]

      RAW_ERROR_DETAILS:
      [...]

      RAW_ERROR_HINT:
      [...]

      HTTP_STATUS:
      [...]

      Não retornar somente a mensagem amigável da UI.

      ==================================================
      4 — COMPARAR PAYLOAD COM RPC
      ==================================================

      Comparar parâmetros efetivamente enviados pela server function com a assinatura
      REAL instalada da RPC.

      Gerar:

      PARAMETER | SERVER VALUE | RPC EXPECTED | MATCH

      Validar pelo menos:

      ausencia_id
      novo_tipo
      periodo
      data_inicio
      data_fim
      horario_inicio
      horario_fim
      documento/storage_path
      motivo
      justificativa
      actor/user id
      correlation_id, se aplicável

      Reportar:

      SERVER_PAYLOAD_MATCH:
      PASS/FAIL

      MISSING_PARAM:
      [...]

      EXTRA_PARAM:
      [...]

      ==================================================
      5 — TESTAR GRANTS DAS TABELAS
      ==================================================

      Além do EXECUTE da RPC, validar privilégios efetivos necessários nas tabelas.

      Verificar:

      INSERT em ausencia_retificacoes
      UPDATE em ausencias
      INSERT em tabela de auditoria correspondente

      Reportar:

      HISTORY_INSERT_GRANT:
      PASS/FAIL

      AUSENCIA_UPDATE_GRANT:
      PASS/FAIL

      AUDIT_INSERT_GRANT:
      PASS/FAIL

      Não alterar grants.

      ==================================================
      6 — VALIDAR RLS
      ==================================================

      Confirmar se as operações chegam às policies RLS.

      Reportar:

      HISTORY_RLS_REACHED:
      SIM/NÃO

      AUSENCIA_RLS_REACHED:
      SIM/NÃO

      AUDIT_RLS_REACHED:
      SIM/NÃO

      RLS_BLOCKING:
      SIM/NÃO/INCONCLUSIVO

      ==================================================
      7 — PERSISTÊNCIA PARCIAL
      ==================================================

      Após a tentativa que apresenta erro ao usuário, consultar a fonte de verdade.

      Confirmar:

      AUSENCIA_UPDATED:
      SIM/NÃO

      RETIFICATION_HISTORY_CREATED:
      SIM/NÃO

      AUDIT_EVENT_CREATED:
      SIM/NÃO

      DOCUMENT_UPLOADED:
      SIM/NÃO/NOT_APPLICABLE

      ORPHAN_STORAGE:
      SIM/NÃO/NOT_APPLICABLE

      É obrigatório descobrir se existe:

      erro visual após commit

      ou

      falha real antes da persistência.

      ==================================================
      8 — MEIO PERÍODO
      ==================================================

      Se o teste utilizar MEIO PERÍODO (HORAS):

      confirmar especificamente:

      horario_inicio chega à RPC:
      SIM/NÃO

      horario_fim chega à RPC:
      SIM/NÃO

      campos persistem no histórico:
      SIM/NÃO

      campos persistem na ausência:
      SIM/NÃO

      ==================================================
      9 — RESPONSE HANDLER
      ==================================================

      Se todos os stages de banco passarem:

      inspecionar a resposta retornada ao frontend.

      Confirmar:

      Content-Type
      JSON válido
      HTML inesperado
      status HTTP
      parsing
      retry
      double-submit

      Reportar:

      BACKEND_COMMIT:
      PASS/FAIL

      FRONTEND_RECOGNIZED_SUCCESS:
      SIM/NÃO

      ==================================================
      10 — NÃO CORRIGIR
      ==================================================

      NÃO alterar:

      RPC
      schemas
      RLS
      grants
      UI
      storage
      server functions
      src/routes/index.tsx

      Nenhuma migration nesta etapa.

      ==================================================
      RELATÓRIO FINAL OBRIGATÓRIO
      ==================================================

      INCIDENT:
      RETIFICACAO_OPERACIONAL_REOPENED

      REPRODUCED:
      SIM/NÃO

      STAGE_A_UI:
      PASS/FAIL

      STAGE_B_UPLOAD:
      PASS/FAIL/NOT_APPLICABLE

      STAGE_C_ZOD:
      PASS/FAIL

      STAGE_D_SERVER_FUNCTION:
      PASS/FAIL

      STAGE_E_AUTH_RBAC:
      PASS/FAIL

      STAGE_F_RPC:
      PASS/FAIL

      STAGE_G_HISTORY_INSERT:
      PASS/FAIL/NOT_REACHED

      STAGE_H_AUSENCIA_UPDATE:
      PASS/FAIL/NOT_REACHED

      STAGE_I_AUDIT:
      PASS/FAIL/NOT_REACHED

      STAGE_J_FRONTEND_RESPONSE:
      PASS/FAIL/NOT_REACHED

      FIRST_FAILED_STAGE:
      [...]

      RAW_ERROR_CODE:
      [...]

      RAW_ERROR_MESSAGE_SAFE:
      [...]

      SERVER_PAYLOAD_MATCH:
      PASS/FAIL

      HISTORY_INSERT_GRANT:
      PASS/FAIL

      AUSENCIA_UPDATE_GRANT:
      PASS/FAIL

      AUDIT_INSERT_GRANT:
      PASS/FAIL

      RLS_BLOCKING:
      SIM/NÃO/INCONCLUSIVO

      AUSENCIA_UPDATED:
      SIM/NÃO

      RETIFICATION_HISTORY_CREATED:
      SIM/NÃO

      AUDIT_EVENT_CREATED:
      SIM/NÃO

      BACKEND_COMMIT:
      PASS/FAIL

      FRONTEND_RECOGNIZED_SUCCESS:
      SIM/NÃO

      ROOT_CAUSE_CLASSIFICATION:
      [...]

      ROOT_CAUSE:
      [...]

      ROOT_CAUSE_PROVEN:
      SIM/NÃO

      READY_FOR_SURGICAL_FIX:
      SIM/NÃO

      HOME_GUARDRAIL:
      PASS/FAIL

      NÃO IMPLEMENTAR CORREÇÃO.

      PARAR.

      Aguardar Parte 2.
    </div>
  ),
});



