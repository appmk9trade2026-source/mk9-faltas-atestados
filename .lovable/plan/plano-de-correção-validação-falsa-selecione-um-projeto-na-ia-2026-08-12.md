# Plano de Correção: Validação Falsa "Selecione um Projeto" na IA

Este plano visa corrigir o erro onde o usuário recebe um aviso falso de que o projeto não foi selecionado ao clicar em "Sugerir com IA", mesmo quando o projeto está visivelmente preenchido no formulário. A falha reside na sincronização entre o estado visual do componente Select e o estado interno do formulário consumido pelo handler da IA.

## Mudanças Propostas

### Frontend (src/routes/_authenticated/planos-acao.tsx)

#### 1. Diagnóstico e Sincronização de Estado
- O handler `handleGenerateAI` utiliza `form.getValues("projeto_id")`.
- O componente `Select` do Projeto utiliza `field.value`.
- A causa provável é o `defaultValues` ou falha no `onValueChange` em persistir o UUID correto.
- **Ação:** Garantir que o `Select` do Projeto use explicitamente o UUID e que o `handleGenerateAI` valide o UUID real.

#### 2. Refatoração das Mensagens de Validação (Etapas 5 e 6)
- Desacoplar a mensagem genérica atual em mensagens específicas:
  - **Projeto ausente:** "Selecione um projeto para gerar sugestões com IA."
  - **Problema curto:** "Descreva o problema com pelo menos 5 caracteres para gerar sugestões com IA."
  - **Supervisor ausente (se alvo for Supervisor):** "Selecione um supervisor para gerar a análise contextual."
  - **Colaborador ausente (se alvo for Colaborador):** "Selecione um colaborador para gerar a análise contextual."

#### 3. Correção no Handler handleGenerateAI
- Atualizar a lógica de verificação para checar a hierarquia completa baseada no `tipo_alvo`.
- Garantir que o payload enviado à IA contenha os UUIDs corretos.

### Backend (src/lib/planos-acao-ia.functions.ts)

#### 1. Robustez do Validator
- O `suggestionInputSchema` já exige UUIDs. A correção no frontend garantirá que strings vazias ou nomes não cheguem aqui.

## Detalhes Técnicos

- **React Hook Form:** Manter a consistência entre o `Select` e o `watch/getValues`.
- **Zod:** Manter a validação estrita no servidor.
- **UI/UX:** Utilizar o sistema de `toast` existente para as novas mensagens detalhadas.

## Testes de Regressão

- Verificar se a IA continua recebendo o contexto operacional de 60 dias.
- Garantir que a troca de Projeto limpa os estados de Supervisor/Colaborador (já implementado, mas passível de verificação).
- Confirmar que o `src/routes/index.tsx` permanece intocado (Guardrail P0).
