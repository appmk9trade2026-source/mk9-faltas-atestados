# Plano de Ação Gerencial — Correção de Selects e Assistente de IA

Este plano detalha a correção dos filtros de Projeto e Colaborador no formulário de Planos de Ação, garantindo o respeito ao escopo de RBAC e a implementação de um assistente assistivo por IA.

## Mudanças

### Banco de Dados (Supabase)

- Nenhuma alteração de esquema necessária.
- Garantir que as tabelas `planos_acao`, `projetos` e `colaboradores` possuam `GRANT` adequado para a role `authenticated`.

### Backend (Server Functions)

- **Correção de Escopo**: Revisar `src/lib/planos-acao.functions.ts` para garantir que a criação de planos valide o vínculo Colaborador x Projeto.
- **Assistente de IA**: Criar `src/lib/planos-acao-ia.functions.ts` para prover a lógica de geração de sugestões via Lovable AI Gateway.
- **Contexto Seguro**: Implementar sanitização para garantir que dados sensíveis (CID, atestados) nunca sejam enviados para o modelo de IA.

### Frontend (UI/UX)

- **Filtros Dinâmicos**: Em `src/routes/_authenticated/planos-acao.tsx`, corrigir os hooks e componentes de select para carregar projetos do escopo do usuário e, subsequentemente, colaboradores do projeto selecionado.
- **Busca Aprimorada**: Habilitar busca por nome e matrícula nos selects.
- **Assistente Assistivo**: Adicionar botão "✨ Gerar plano com IA" ao lado do campo "Problema Identificado".
- **Feedback Visual**: Implementar estados de carregamento e indicação visual de conteúdo sugerido por IA.

## Detalhes Técnicos

### 1. Correção dos Selects
- Utilizar `useProjetosAtivosPorEmpresa` e `useColaboradoresAtivos` já existentes.
- Garantir que o select de Colaborador seja habilitado apenas após a seleção de um Projeto.
- Implementar `Command` do shadcn para busca eficiente.

### 2. Assistente de IA
- Endpoint server-side `gerarSugestaoPlanoAcao`.
- Prompt focado em metas mensuráveis e ações práticas baseadas no problema informado.
- Uso de `scrubString` para higienização de PII antes do envio.

### 3. Guardrails
- **Guardrail P0**: Manter `src/routes/index.tsx` como redirecionamento puro.
- **Segurança**: IA assistiva apenas, sem salvamento automático.
- **Privacidade**: Bloqueio total de envio de dados médicos para a IA.

## Testes

1. Validar que Super Admin vê todos os projetos e RH vê seu escopo administrativo.
2. Validar que Coordenadores e Supervisores veem apenas seus respectivos projetos.
3. Validar que a lista de colaboradores é filtrada corretamente pelo projeto selecionado.
4. Validar que o assistente de IA gera sugestões coerentes e editáveis.
5. Confirmar que o build do projeto continua passando sem erros.
