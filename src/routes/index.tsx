import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: () => (
    <div className="p-8 font-mono text-sm leading-relaxed whitespace-pre-wrap max-w-4xl mx-auto bg-card border rounded-lg shadow-sm">
      CRM MK9 — INCIDENTE P1
      RETIFICAÇÃO DE AUSÊNCIAS / ATESTADOS
      PARTE 1 — DIAGNÓSTICO FORENSE REAL

      CONTEXTO

      Usuários continuam sem conseguir concluir retificações de:

      - faltas;
      - atestados;
      - meio período;
      - outros tipos de ausência.

      Esse problema já havia sido tratado anteriormente, porém o erro continua
      ocorrendo no ambiente operacional.

      Portanto:

      RETIFICACAO = FAIL
      PRODUCTION_RETEST = FAIL
      INCIDENT_STATUS = REOPENED

      OBJETIVO DESTA PARTE

      Descobrir EXATAMENTE onde a retificação está falhando hoje.

      NÃO corrigir nada nesta etapa.

      NÃO alterar UI.
      NÃO alterar RPC.
      NÃO alterar schema.
      NÃO criar migration.
      NÃO alterar RLS/RBAC.

      Somente diagnosticar.

      ==================================================
      1 — REPRODUZIR UMA RETIFICAÇÃO REAL
      ==================================================

      No ambiente publicado:

      abrir um registro elegível para retificação.

      Executar uma retificação controlada.

      Capturar:

      protocolo original;
      ausencia_id;
      tipo atual;
      novo tipo;
      período;
      horários quando aplicável;
      documento quando aplicável;
      motivo;
      justificativa.

      Não utilizar dados pessoais desnecessários no relatório.

      ==================================================
      2 — CAPTURAR O PRIMEIRO ERRO REAL
      ==================================================

      Não usar somente o toast amigável como diagnóstico.

      Capturar ANTES da sanitização/mapSupabaseError:

      raw error code
      raw error message
      raw details
      raw hint
      HTTP status se aplicável
      stage da falha

      Sanitizar PII e secrets.

      ==================================================
      3 — MAPEAR FLUXO PONTA A PONTA
      ==================================================

      Rastrear o fluxo real:

      RetificarAusenciaDialog / UI
      → submit handler
      → upload de documento, se houver
      → server function
      → Zod/schema
      → requireSupabaseAuth
      → RBAC/RLS
      → RPC retificar_ausencia
      → INSERT no histórico
      → UPDATE da ausência
      → audit event
      → resposta ao frontend

      Identificar o PRIMEIRO stage que falha.

      ==================================================
      4 — VERIFICAR CONTRATO DE HORÁRIOS
      ==================================================

      Para retificações de:

      MEIO PERÍODO (HORAS)

      confirmar se os campos:

      horario_inicio
      horario_fim

      estão presentes e alinhados em:

      UI
      schema Zod
      server function
      RPC
      tabela ausencia_retificacoes
      tabela ausencias

      Reportar divergências.

      Não corrigir.

      ==================================================
      5 — VERIFICAR DOCUMENTO / STORAGE
      ==================================================

      Quando o novo tipo exigir documento:

      confirmar:

      upload iniciou?
      upload concluiu?
      storage path gerado?
      bucket privado?
      RPC recebe o path esperado?
      schema aceita path relativo?
      há URL absoluta sendo exigida indevidamente?

      Reportar:

      UPLOAD:
      PASS/FAIL/NOT_APPLICABLE

      STORAGE:
      PASS/FAIL/NOT_APPLICABLE

      ==================================================
      6 — VERIFICAR AUTH DRIFT
      ==================================================

      Inspecionar a server function de retificação.

      Confirmar se usa padrão canônico:

      requireSupabaseAuth
      context.userId
      context.supabase

      Verificar se existe anti-pattern:

      supabase.auth.getUser()

      via cliente frontend dentro de Server Function.

      Reportar:

      AUTH_DRIFT:
      SIM/NÃO

      ==================================================
      7 — VERIFICAR RPC REAL NO BANCO
      ==================================================

      Consultar a assinatura REAL instalada de:

      public.retificar_ausencia

      ou nome canônico atual.

      Comparar com os parâmetros enviados pela server function.

      Reportar:

      RPC_SIGNATURE:
      [...]

      SERVER_PAYLOAD_MATCH:
      PASS/FAIL

      MISSING_PARAM:
      [...]

      EXTRA_PARAM:
      [...]

      ==================================================
      8 — VERIFICAR HISTÓRICO
      ==================================================

      Inspecionar:

      public.ausencia_retificacoes

      Confirmar se existem todas as colunas necessárias hoje.

      Especialmente:

      tipo anterior/novo
      período anterior/novo
      horario_inicio
      horario_fim
      documento/path
      motivo
      justificativa
      actor
      created_at

      Reportar:

      HISTORY_SCHEMA_MATCH:
      PASS/FAIL

      ==================================================
      9 — VERIFICAR GRANTS + RLS
      ==================================================

      Como tivemos outros incidentes de privilégios no banco, validar também:

      EXECUTE na RPC
      SELECT/INSERT/UPDATE necessários
      RLS da ausência
      RLS do histórico
      GRANTs das tabelas envolvidas

      Não alterar.

      Reportar:

      RPC_EXECUTE:
      PASS/FAIL

      HISTORY_INSERT_GRANT:
      PASS/FAIL

      AUSENCIA_UPDATE_GRANT:
      PASS/FAIL

      RLS_BLOCKING:
      SIM/NÃO/INCONCLUSIVO

      ==================================================
      10 — VERIFICAR PERSISTÊNCIA PARCIAL
      ==================================================

      Após a tentativa que falha:

      AUSENCIA_UPDATED:
      SIM/NÃO

      RETIFICATION_HISTORY_CREATED:
      SIM/NÃO

      AUDIT_EVENT_CREATED:
      SIM/NÃO

      DOCUMENT_UPLOADED:
      SIM/NÃO

      ORPHAN_STORAGE:
      SIM/NÃO

      Importante:

      não permitir que erro visual esconda commit parcial.

      ==================================================
      11 — CLASSIFICAR CAUSA
      ==================================================

      Classificar somente com evidência:

      UI_PAYLOAD
      ZOD_CONTRACT
      AUTH_DRIFT
      RPC_SIGNATURE
      DATABASE_GRANT
      RLS
      HISTORY_SCHEMA
      STORAGE_CONTRACT
      AUDIT_FAILURE
      PARTIAL_COMMIT
      OTHER
      INCONCLUSIVE

      ==================================================
      GUARDRAILS
      ==================================================

      NÃO alterar:

      src/routes/index.tsx
      Nova Ausência
      Ocorrência de Ponto
      Processamento Interno
      Central de Suporte
      RBAC/RLS
      Kill Switch
      AI_KILL_SWITCH

      NÃO escrever relatório técnico na Home.

      NÃO implementar correção nesta execução.

      ==================================================
      RELATÓRIO FINAL
      ==================================================

      INCIDENT:
      RETIFICACAO_OPERACIONAL_REOPENED

      ENVIRONMENT:
      PRODUCTION

      REPRODUCED:
      SIM/NÃO

      FIRST_FAILED_STAGE:
      [...]

      RAW_ERROR_CODE:
      [...]

      RAW_ERROR_SOURCE:
      [...]

      RAW_ERROR_MESSAGE_SAFE:
      [...]

      AUTH_DRIFT:
      SIM/NÃO

      ZOD_CONTRACT:
      PASS/FAIL

      RPC_SIGNATURE:
      [...]

      SERVER_PAYLOAD_MATCH:
      PASS/FAIL

      HISTORY_SCHEMA_MATCH:
      PASS/FAIL

      RPC_EXECUTE:
      PASS/FAIL

      HISTORY_INSERT_GRANT:
      PASS/FAIL

      AUSENCIA_UPDATE_GRANT:
      PASS/FAIL

      RLS_BLOCKING:
      SIM/NÃO/INCONCLUSIVO

      UPLOAD:
      PASS/FAIL/NOT_APPLICABLE

      STORAGE:
      PASS/FAIL/NOT_APPLICABLE

      AUSENCIA_UPDATED:
      SIM/NÃO

      RETIFICATION_HISTORY_CREATED:
      SIM/NÃO

      AUDIT_EVENT_CREATED:
      SIM/NÃO

      ORPHAN_DATA:
      SIM/NÃO

      ROOT_CAUSE_CLASSIFICATION:
      [...]

      ROOT_CAUSE:
      [...]

      ROOT_CAUSE_PROVEN:
      SIM/NÃO

      RECOMMENDED_MINIMAL_FIX:
      [...]

      HOME_GUARDRAIL:
      PASS/FAIL

      NÃO IMPLEMENTAR CORREÇÃO.

      PARAR.

      Aguardar Parte 2.
    </div>
  ),
});
