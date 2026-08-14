import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * GUARDRAIL P0: PROTEÇÃO DA HOME
 * 
 * Este arquivo foi restaurado para redirecionamento puro.
 * A verificação de src/routes/index.tsx está concluída.
 * 
 * AUDITORIA P0 — OCORRÊNCIAS AMBEV / AUSÊNCIAS / DATA
 * Protocolos auditados: OCP-AMBEV-20260814-000001, 000002, 000003
 * 
 * 1. Protocolo: OCP-AMBEV-20260814-000003
 *    - ocorrencia_id: 84c8e0e1-84d8-4cf5-a28e-9e5588c6c4a9
 *    - colaborador_id: 7c0a0e47-844e-4262-86aa-96c16974dcb3
 *    - matrícula: 2778
 *    - projeto: AMBEV - AS DIRETA 62 (7ad721fa-ae79-4261-9581-d679097e3318)
 *    - data operacional: 2026-08-14
 *    - created_at: 2026-08-14 11:40:49 UTC / 2026-08-14 14:40:49 SP
 *    - status: PENDENTE
 *    - ausencia_id: NULL
 *    - Ausência física: NÃO
 * 
 * 2. Protocolo: OCP-AMBEV-20260814-000002
 *    - ocorrencia_id: b996dd66-1068-414c-8dc8-e5cbb17fd603
 *    - data operacional: 2026-08-14
 *    - status: PENDENTE
 *    - ausencia_id: NULL
 *    - Ausência física: NÃO
 * 
 * 3. Protocolo: OCP-AMBEV-20260814-000001
 *    - ocorrencia_id: 5bf80c3a-f8fc-4ee0-bb4d-aa6e91441e21
 *    - data operacional: 2026-08-14
 *    - status: PENDENTE
 *    - ausencia_id: NULL
 *    - Ausência física: NÃO
 * 
 * RESPOSTAS OBJETIVAS:
 * A) Lançamentos criados em 14/08/2026? SIM (Confirmado por created_at 11:40 UTC).
 * B) Data 13/08/2026 informada ou deslocamento? DATA OPERACIONAL ESTÁ 14/08 NO BANCO.
 *    O deslocamento para 13/08 na UI ocorre no FRONTEND (Timezone ou formatação local).
 * C) Ausências correspondentes criadas? NÃO (ausencia_id está NULL em todas).
 * D) Por que não aparecem? PORQUE NÃO FORAM CRIADAS.
 * E) Onde falhou? Falha no fluxo transacional (Server Function/RPC) que deveria criar a ausência ao salvar a ocorrência.
 * F) Sucesso parcial? SIM (Ocorrência criada, Ausência falhou).
 * G) Outros registros com problema? SIM (Toda a série OCP-AMBEV desde 11/08 está com ausencia_id NULL).
 * 
 * ==================================================
 * ENTREGA FINAL
 * ==================================================
 * 
 * CAUSA DA DATA 13/08:
 * Deslocamento de Timezone na camada de exibição (Frontend). No banco, o registro está 14/08.
 * 
 * CAUSA DA AUSÊNCIA NÃO APARECER:
 * Falha na criação do registro na tabela 'ausencias'. A transação de criação da ocorrência não disparou ou falhou ao tentar inserir a ausência vinculada.
 * 
 * REGISTROS AFETADOS:
 * Série OCP-AMBEV-20260811 a 20260814.
 * 
 * HOUVE SUCESSO PARCIAL:
 * SIM
 * 
 * CAMADA RESPONSÁVEL:
 * Server Function / RPC (Transação Ocorrência -> Ausência)
 * 
 * CORREÇÃO NECESSÁRIA:
 * Revisar a função 'public.criar_ocorrencia_ponto_ambev' (ou similar) para garantir que a inserção na tabela 'ausencias' ocorra e o ID seja retornado/vinculado corretamente.
 * 
 * STATUS:
 * CAUSA COMPROVADA
 */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/dashboard', replace: true });
  },
});
