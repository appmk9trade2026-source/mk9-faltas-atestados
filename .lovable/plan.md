# Plano de Homologação P0 — Lançamento de Ausências por Supervisores

O objetivo deste plano é executar o diagnóstico forense e a homologação real do fluxo de ausências, resolvendo o incidente P0 de falso conflito e falha no anexo, preservando as regras de negócio e guardrails.

## Etapas de Diagnóstico e Auditoria

1. **Auditoria da Matrícula 2504 (Gustavo Miralha)**
   - Consultar diretamente a tabela `colaboradores` para validar se existem duplicidades de matrícula entre empresas/projetos.
   - Identificar o `colaborador_id` canônico que está sendo retornado na busca.

2. **Auditoria do Protocolo AMBEVASD4-20260812-000008**
   - Verificar na tabela `ausencias` se o protocolo pertence de fato à matrícula 2504 e qual seu status atual (`excluido`, `cancelado`).
   - Confirmar se o registro é elegível para bloqueio de duplicidade.

3. **Validação do Payload Frontend vs Backend**
   - Monitorar via console/network se o `colaborador_id` enviado pelo frontend no `createAusencia` condiz com a matrícula selecionada na tela.
   - Identificar possíveis race conditions na limpeza do estado do formulário (`selectedColaborador`).

## Implementação da Correção Cirúrgica

1. **Hardening de Identidade no Servidor**
   - Reforçar o gate de integridade em `src/lib/ausencias.functions.ts` (função `createAusencia`) para garantir que a matrícula informada no payload de auditoria corresponda ao `colaborador_id` real do banco.
   - Bloquear a operação com erro de `CONFLICT` caso haja divergência.

2. **Refinamento da Função de Duplicidade**
   - Garantir que a RPC `detectar_conflitos_ausencia` ignore estritamente registros com `status_documental` em `EXCLUIDO` ou `CANCELADO`.

3. **Garantia de Atomicidade do Anexo**
   - Revisar o fluxo de upload em `src/routes/_authenticated/nova-ausencia.tsx` para assegurar que a criação da ausência só seja confirmada se o vínculo com o `arquivo_url` for bem-sucedido.

## Homologação e Testes Reais

1. **Teste com Perfil de Supervisor**
   - Buscar a matrícula 2504.
   - Criar um lançamento de Falta com anexo.
   - Validar a persistência no banco e a visibilidade em `/ausencias`.
   - Testar a duplicidade real tentando lançar o mesmo período novamente.

2. **Testes de Não Regressão**
   - Validar o funcionamento normal da Central de Processamento, Qualidade de Lançamentos Fase 3 e OCP AMBEV.
   - Garantir que o redirecionamento da Home (`src/routes/index.tsx`) permanece intacto.

## Technical Details

- **Files affected**: `src/lib/ausencias.functions.ts`, `src/routes/_authenticated/nova-ausencia.tsx`, `src/routes/_authenticated/ausencias.tsx`.
- **Database**: Auditoria direta via `supabase.from('colaboradores')` e `supabase.from('ausencias')` para diagnóstico.
- **Guardrail P0**: A Home (`/`) continuará sendo um redirect puro para `/dashboard`.
