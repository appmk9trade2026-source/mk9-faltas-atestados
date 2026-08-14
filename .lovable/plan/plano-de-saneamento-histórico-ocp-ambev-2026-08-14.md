# Plano de Saneamento Histórico OCP AMBEV

Este plano descreve o saneamento dos 8 registros órfãos identificados na auditoria forense.

## Etapa 1 — Blindagem da Home
O arquivo `src/routes/index.tsx` já foi restaurado para um redirecionamento puro, removendo qualquer documentação técnica ou comentários de auditoria da interface.

## Etapa 2 — Dry Run (Auditoria de Registros Órfãos)

Abaixo estão os 8 registros órfãos (`ausencia_id IS NULL`) identificados entre 11/08/2026 e 14/08/2026:

| Protocolo OCP | Data | Colaborador | Matrícula | Projeto | Classificação | Ação Recomendada |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| OCP-AMBEV-20260814-000001 | 14/08/2026 | GRACIANE BRITO | 2778 | AS DIRETA 62 | A. CRIAR AUSÊNCIA | Inserir Falta e vincular |
| OCP-AMBEV-20260814-000003 | 14/08/2026 | GRACIANE BRITO | 2778 | AS DIRETA 62 | A. CRIAR AUSÊNCIA | Inserir Falta e vincular |
| OCP-AMBEV-20260814-000002 | 14/08/2026 | GRACIANE BRITO | 2778 | AS DIRETA 62 | A. CRIAR AUSÊNCIA | Inserir Falta e vincular |
| OCP-AMBEV-20260813-000001 | 13/08/2026 | GRACIANE BRITO | 2778 | AS DIRETA 62 | A. CRIAR AUSÊNCIA | Inserir Falta e vincular |
| OCP-AMBEV-20260812-000001 | 12/08/2026 | GRACIANE BRITO | 2778 | AS DIRETA 62 | A. CRIAR AUSÊNCIA | Inserir Falta e vincular |
| OCP-AMBEV-20260811-000001 | 11/08/2026 | ALISSON SANTIAGO | 2351 | AS DIRETA 61 | A. CRIAR AUSÊNCIA | Inserir Falta e vincular |
| OCP-AMBEV-20260811-000003 | 11/08/2026 | GRACIANE BRITO | 2778 | AS DIRETA 62 | A. CRIAR AUSÊNCIA | Inserir Falta e vincular |
| OCP-AMBEV-20260811-000002 | 11/08/2026 | ALISSON SANTIAGO | 2351 | AS DIRETA 61 | A. CRIAR AUSÊNCIA | Inserir Falta e vincular |

**Critério de Classificação:** Todos os registros possuem status `PENDENTE` e referem-se a lançamentos operacionais que exigem uma ausência do tipo `FALTA` (natureza do OCP AMBEV). Não foram encontradas ausências equivalentes pré-existentes para estes períodos/colaboradores.

## Detalhes Técnicos

1. **Proteção contra Duplicidade**: Antes de cada inserção na Etapa 4, o sistema verificará novamente a existência de ausências para o `colaborador_id` na `data_ocorrencia`.
2. **Backfill Transacional**:
   - Criação de registros na tabela `public.ausencias` com `tipo = 'FALTA'`, `data_inicio` e `data_fim` baseados na `data_ocorrencia`.
   - Atualização da coluna `ausencia_id` na tabela `public.ocorrencias_ponto` vinculando ao novo ID.
   - Auditoria automática via triggers existentes.
3. **Rollback**: Caso qualquer inserção falhe, a transação do registro individual será revertida.

## Próximos Passos
Após aprovação, executarei o script de saneamento via banco de dados e apresentarei o relatório de entrega final com o status de "SANEAMENTO HISTÓRICO CONCLUÍDO".
