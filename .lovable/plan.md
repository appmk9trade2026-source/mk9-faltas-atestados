# Plano de Reconciliação Forense - Fase 1 (Somente Leitura)

Este plano visa realizar o mapeamento e classificação dos 90 objetos órfãos identificados no bucket `atestados`, sem realizar qualquer alteração estrutural ou de dados (SOMENTE LEITURA).

## 1. Coleta de Dados (Snapshot)
- Consultar metadados de todos os 90 objetos no bucket `atestados`.
- Extrair: `name` (path), `created_at`, `size`, `metadata` (se houver).
- Consultar a tabela `public.ausencias` para identificar lacunas (documentos nulos ou inexistentes no storage).

## 2. Análise de Padrões e Correlação
- Analisar os paths dos objetos em busca de IDs de ausência ou protocolos.
- Realizar correlação temporal entre o `created_at` do storage e o `criado_at` (ou ID incremental) das ausências.
- Verificar logs de auditoria (`public.audit_logs`) em busca de eventos de upload falhos ou desconectados.

## 3. Classificação de Confiança
Classificar cada objeto conforme a matriz:
- **A (Exata):** ID/Protocolo explícito no path ou metadado.
- **B (Forte):** Correlação temporal e de usuário única e inequívoca.
- **C (Ambíguo):** Múltiplas ausências candidatas para o mesmo timestamp/usuário.
- **D (Sem Correspondência):** Objeto sem qualquer rastro no banco de dados.
- **E (Cancelados):** Referente a ausências já excluídas/canceladas.

## 4. Entrega
- Gerar um relatório detalhado (JSON ou Markdown interno) com a matriz de reconciliação.
- Não executar nenhum `UPDATE` ou `DELETE`.
- Manter o redirecionamento da `home` intacto conforme Guardrail P0.

---
**Status:** Mapeamento Forense Iniciado (Aguardando Snapshot)
