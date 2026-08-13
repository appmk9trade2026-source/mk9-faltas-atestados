# Plano de Ação: Incidente P0 - Supervisor RLS Failure

Este plano visa diagnosticar e corrigir o erro de Segurança de Nível de Linha (RLS) que impede Supervisores de realizarem lançamentos de ausências, especialmente ao anexar documentos.

## Objetivos
- Identificar a política de RLS exata que está causando o bloqueio (Storage, Colaboradores ou Ausências).
- Garantir que o upload de evidências no bucket privado `atestados` funcione corretamente para Supervisores e Coordenadores.
- Validar o fluxo de registro manual e automático sem comprometer a integridade dos dados ou as regras da AMBEV.

## Etapas de Diagnóstico e Correção

### 1. Auditoria de Políticas de RLS
- **Ação**: Listar e analisar todas as políticas aplicadas às tabelas `storage.objects`, `public.colaboradores` e `public.ausencias`.
- **Foco**: Verificar se a função `atestado_path_visivel_para` ou as políticas de `INSERT` no bucket `atestados` possuem restrições que bloqueiam o papel `supervisor`.

### 2. Validação da Função de Escopo
- **Ação**: Auditar a função `public.atestado_path_visivel_para` para garantir que ela aceite o prefixo `ausencias/` (usado no frontend) além de `ocorrencias-ponto/`.
- **Correção**: Caso o prefixo `ausencias/` não esteja autorizado para Supervisores na função de visibilidade, atualizar a função.

### 3. Verificação de Grants e Permissões de RPC
- **Ação**: Confirmar se o papel `authenticated` (ou especificamente `supervisor`) possui permissão `EXECUTE` na RPC `registrar_ausencia_com_colaborador_manual`.
- **Foco**: Garantir que o auto-cadastro de colaboradores durante o lançamento manual não seja bloqueado por RLS na tabela `public.colaboradores`.

### 4. Ajuste no Frontend (Se necessário)
- **Ação**: Verificar se o path gerado pelo frontend (`ausencias/{colaborador_id}/...`) coincide com o esperado pelas políticas de storage.
- **Correção**: Ajustar a lógica de geração de path se houver divergência entre o frontend e as regras de segurança do banco.

## Critérios de Aceitação
- Supervisores conseguem realizar lançamentos (Falta/Atestado) com e sem anexos.
- Coordenadores conseguem realizar lançamentos para suas equipes.
- O bucket `atestados` permanece estritamente privado.
- Nenhuma regressão nas regras de integridade (1 colaborador -> 1 projeto).
- **Guardrail P0**: A Home (`src/routes/index.tsx`) permanece como um redirecionamento puro para `/dashboard`.

## Detalhes Técnicos
- **Bucket**: `atestados` (Privado).
- **Tabelas Afetadas**: `public.ausencias`, `public.colaboradores`, `storage.objects`.
- **Funções Críticas**: `atestado_path_visivel_para`, `require_permission`, `registrar_ausencia_com_colaborador_manual`.
