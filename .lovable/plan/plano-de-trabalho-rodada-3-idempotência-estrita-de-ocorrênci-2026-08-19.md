# Plano de Trabalho - Rodada 3 - Idempotência Estrita de Ocorrência de Ponto

Este plano detalha as etapas para o fechamento isolado do GAP P2 de idempotência no fluxo de Ocorrência de Ponto, garantindo a integridade do baseline congelado da Rodada 2.

## 1. Diagnóstico e Mapeamento (Etapa 1)
- [x] Inspecionar `src/lib/ocorrencias.functions.ts` (Server Functions).
- [x] Inspecionar `src/routes/_authenticated/ocorrencias-ponto.tsx` (Frontend).
- [x] Mapear fluxo: UI -> Storage -> Server Fn -> RPC `criar_ocorrencia_ponto_ambev`.
- [ ] Identificar geração do `correlation_id` (atualmente parece ser `crypto.randomUUID()` apenas no catch de erro, mas injetado como `traceId`).

## 2. Contrato de Idempotência (Etapa 2)
- Definir chave canônica baseada na operação lógica.
- A chave deve permitir retries seguros sem duplicidade.

## 3. Implementação Backend (Etapa 3 & 5)
- [ ] Criar migration para adicionar restrição de unicidade baseada em `correlation_id` (ou similar) na tabela `ocorrencias_ponto`.
- [ ] Ajustar a RPC `criar_ocorrencia_ponto_ambev` para suportar idempotência nativa.
- [ ] Garantir que eventos de auditoria e criação de ausências vinculadas respeitem a idempotência.

## 4. Storage e Frontend (Etapa 4 & 6)
- [ ] Validar se o retry de upload gera arquivos órfãos (o código atual já tem prevenção de órfãos no `onError`).
- [ ] Ajustar a UI para lidar com a resposta `CONFLICT` / `ALREADY_COMMITTED` e mostrar mensagem amigável com o protocolo original.

## 5. Testes e Validação (Etapa 7, 8 & 9)
- [ ] Executar bateria `IDEMP-001` a `IDEMP-008`.
- [ ] Validar concorrência e integridade do baseline congelado.
- [ ] Executar build de produção e check de tipos.

## 6. Encerramento (Etapa 10)
- [ ] Gerar Relatório Final Obrigatório no dashboard.
- [ ] Se bem-sucedido, marcar `STRICT_IDEMPOTENCY` como `CLOSED`.
