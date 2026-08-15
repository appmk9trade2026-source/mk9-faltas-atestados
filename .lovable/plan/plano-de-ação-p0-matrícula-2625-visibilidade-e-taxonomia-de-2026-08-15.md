# Plano de Ação — P0 Matrícula 2625: Visibilidade e Taxonomia de Erros

Correção cirúrgica da falha de visibilidade da colaboradora Karina Mercado (matrícula 2625) e aprimoramento da taxonomia de erros para evitar falsos positivos de duplicidade.

## Diagnóstico Técnico
1.  **Visibilidade RLS**: O registro da matrícula 2625 existe e está ativo no banco, mas não é retornado na busca automática para o Supervisor Jonas Neto Xaropa.
2.  **Causa Raiz RLS**: Falha na política de visibilidade ou descompasso no vínculo `supervisor_usuario_id` versus `coordenador_usuario_id`.
3.  **Mascaramento de Erros**: O backend converte falhas genéricas de permissão/RLS (`42501`) em `CONFLICT`, e o frontend exibe a mensagem padrão de duplicidade de período, induzindo o usuário ao erro.

## Etapas de Implementação

### 1. Hardening da Taxonomia de Erros (Backend)
- Ajustar `src/lib/ausencias.functions.ts` para separar claramente `CONFLICT` (duplicidade real) de `PROJECT_SCOPE_DENIED` (erro de visibilidade/RLS).
- Garantir que erros de RLS retornem mensagens explicativas sobre escopo, não sobre duplicidade.

### 2. Ajuste de Visibilidade RLS (Database)
- Investigar e corrigir as permissões de SELECT na tabela `public.colaboradores` para garantir que Supervisores vejam seus próprios colaboradores, mesmo que estes tenham sido criados por administradores.
- Aplicar `GRANT SELECT ON public.colaboradores TO authenticated`.

### 3. Melhoria na Busca e UX (Frontend)
- Em `src/routes/_authenticated/nova-ausencia.tsx`, tratar o erro `PROJECT_SCOPE_DENIED` com uma mensagem específica: "Este colaborador existe, mas não pertence ao seu escopo atual."
- Corrigir a detecção de "Matrícula já existente" no modo manual para que, se a matrícula for encontrada (mesmo fora de escopo), ele informe o erro de escopo em vez de tentar criar um duplicata.

### 4. Validação Forense
- Testar busca automática com a matrícula 2625 sob a sessão do Supervisor Jonas.
- Tentar lançamento manual com a mesma matrícula e validar a taxonomia da mensagem de erro.
- Testar regressão de duplicidade real para garantir que períodos sobrepostos continuam bloqueados.

## Detalhes Técnicos
- **Arquivo**: `src/lib/ausencias.functions.ts`
- **Arquivo**: `src/routes/_authenticated/nova-ausencia.tsx`
- **Migration**: Ajuste de policies RLS para a tabela `colaboradores`.
- **Invariante**: Proibido abrir RLS globalmente. O acesso deve ser restrito à hierarquia `supervisor_usuario_id` ou `coordenador_usuario_id`.
