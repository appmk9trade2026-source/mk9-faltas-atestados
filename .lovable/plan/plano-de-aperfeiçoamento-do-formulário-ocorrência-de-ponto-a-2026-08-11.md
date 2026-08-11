# Plano de Aperfeiçoamento do Formulário: Ocorrência de Ponto AMBEV

Melhoria do fluxo de seleção de colaboradores no formulário de Ocorrências de Ponto AMBEV, adicionando o filtro intermediário por Supervisor (UUID canônico) para facilitar a localização em projetos grandes.

## Alterações Técnicas

### 1. Banco de Dados (Migration)
- Adicionar coluna `supervisor_usuario_id` (UUID, FK para auth.users) na tabela `public.ocorrencias_ponto`.
- Atualizar permissões (GRANT) e políticas RLS para suportar o novo campo.

### 2. Backend (Server Functions)
- **src/lib/ocorrencias.functions.ts**:
    - Atualizar `ocorrenciaPontoSchema` para incluir `supervisor_usuario_id`.
    - Atualizar `criarOcorrencia` para persistir o novo campo.
    - Atualizar `listarOcorrencias` para retornar os dados do supervisor no histórico.
    - Criar ou ajustar RPC/Função para listar supervisores vinculados a um projeto (baseado nos colaboradores ativos).

### 3. Frontend (Interface)
- **src/routes/_authenticated/ocorrencias-ponto.tsx**:
    - Inserir campo `Supervisor` entre `Projeto` e `Colaborador`.
    - Implementar lógica de dependência:
        - `Supervisor` desabilitado até `Projeto` ser selecionado.
        - `Colaborador` desabilitado até `Supervisor` ser selecionado.
    - Implementar auto-seleção e bloqueio do campo `Supervisor` se o usuário logado possuir a role `supervisor`.
    - Ajustar `useColaboradoresAtivos` ou o componente de busca para filtrar por `projeto_id` + `supervisor_usuario_id`.
    - Garantir carregamento completo dos colaboradores (sem limites que ocultem registros legítimos).
    - Implementar limpeza de campos em cascata na troca de Projeto ou Supervisor.

## User Review Required

> [!IMPORTANT]
> A persistência do `supervisor_usuario_id` na ocorrência é fundamental para o snapshot histórico (saber quem era o supervisor no momento do registro). Prosseguirei com a migration para adicionar este campo.

- **Deseja que o Supervisor seja preenchido automaticamente também para Coordenadores que selecionarem um projeto onde há apenas um supervisor?** (Assumirei que não, mantendo a escolha manual para flexibilidade).
- **A busca por matrícula deve ser priorizada no Select de Colaborador?** (Implementarei busca combinada Nome + Matrícula).

## Technical Details

- **Fonte de Supervisores**: A lista de supervisores por projeto será derivada dinamicamente da tabela `colaboradores` (onde `ativo = true` e `empresa_id = AMBEV`).
- **UUID Canônico**: O campo `supervisor_usuario_id` será utilizado para todas as operações de filtro e autorização.
- **Guardrails**: Nenhuma alteração na `Home` ou em outros módulos (`Dashboard`, `Processamento`).
