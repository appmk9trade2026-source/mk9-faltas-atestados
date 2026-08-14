# Plano de Estabilização P0 — Fluxo de Nova Ausência

Este plano visa resolver a ambiguidade na função `detectar_conflitos_ausencia` e estabilizar o fluxo de lançamento de ausências, conforme solicitado.

## Etapa 1: Correção de Ambiguidade (Concluída)
- Removidos overloads conflitantes da função `public.detectar_conflitos_ausencia`.
- Criada assinatura única e canônica que suporta todos os parâmetros necessários (incluindo `_projeto_id` e `_supervisor_id`).
- Aplicados `GRANT`s necessários para permitir execução por usuários autenticados.

## Etapa 2: Ajuste de Tipagem e Chamadas (Em Andamento)
- Corrigir as chamadas em `src/lib/ausencias.functions.ts` para alinhar com os novos tipos da RPC.
- Garantir que valores nulos sejam tratados corretamente para evitar erros de compilação TS.
- Remover o uso de `as any` onde a tipagem agora é estável.

## Etapa 3: Homologação e Testes (Próximos Passos)
- Validar o lançamento de **FALTA** (sem anexo).
- Validar o lançamento de **ATESTADO** (com JPG e PDF).
- Confirmar que a detecção de conflitos reais funciona (bloqueio de duplicidade).
- Confirmar que registros **CANCELADOS** ou **EXCLUIDOS** não geram falsos conflitos.
- Verificar a integridade do bucket de storage (0 novos órfãos).

## Detalhes Técnicos
- A RPC `detectar_conflitos_ausencia` agora aceita 9 parâmetros, com os dois últimos sendo opcionais (`DEFAULT NULL`).
- A lógica de filtragem interna da RPC foi mantida para respeitar as regras de negócio de sobreposição de datas e tipos.
- O frontend e as server functions estão sendo sincronizados com esta nova assinatura.
