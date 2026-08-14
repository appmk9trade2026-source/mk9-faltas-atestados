# Plano de Ação - Incidente P0: Supervisor, Duplicidade e Anexos

Este plano visa corrigir o falso positivo de duplicidade no lançamento de ausências e a falha na persistência de anexos (gerando arquivos órfãos) enfrentados por Supervisores.

## Problemas Identificados
1. **Falso Conflito**: Registros `CANCELADOS` ou `EXCLUIDOS` ainda são considerados em regras de duplicidade.
2. **Anexos Órfãos**: Arquivos são carregados para o Storage, mas não vinculados ao registro da ausência devido a falhas na transação ou RLS.

## Roadmap de Execução

### Etapa 1: Correção da Regra de Duplicidade (SQL)
- Atualizar a função `public.ausencia_duplicada_existente` para ignorar registros com status inativos.
- Garantir que o trigger `tg_ausencias_bloqueia_duplicidade` utilize esta regra atualizada.

### Etapa 2: Auditoria do Fluxo de Anexo (Server Functions)
- Revisar `src/lib/ausencias.functions.ts` e `src/lib/ocorrencias.functions.ts` para garantir que o `arquivo_url` seja persistido corretamente.
- Implementar mecanismo de limpeza: se a criação da ausência falhar, o arquivo recém-carregado deve ser removido do Storage para evitar órfãos.

### Etapa 3: Hardening de RLS e Permissões
- Verificar se as políticas de UPDATE na tabela `public.ausencias` permitem que Supervisores atualizem o campo de anexo.
- Validar a função `public.atestado_path_visivel_para`.

### Etapa 4: Homologação e Verificação
- Realizar teste de ponta a ponta com perfil de Supervisor.
- Verificar se o contador de arquivos órfãos (atualmente 89) para de crescer.

## Detalhes Técnicos
- **SQL**: Alteração da função `ausencia_duplicada_existente`.
- **Backend**: Adição de lógica de compensação (rollback de storage) em `createAusencia`.
- **Frontend**: Ajuste no tratamento de erro de upload em `nova-ausencia.tsx`.
