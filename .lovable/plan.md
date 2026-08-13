# CRM MK9 — Correção UX e Integridade: Matrícula Existente

Este plano visa garantir que matrículas existentes sejam obrigatoriamente vinculadas aos seus cadastros, impedindo a criação indevida de lançamentos manuais quando há um colaborador correspondente no escopo do usuário.

## 1. Auditoria e Regras de Negócio
- **Auditoria de Matrícula (274):** Confirmado no banco que a matrícula 274 pertence a dois colaboradores distintos em empresas diferentes (R&G - AMBEV e R&J - CREDSYSTEM).
- **Chave de Identidade:** A identidade canônica é `empresa_id + matricula`. Matrícula não é globalmente única.
- **Escopo do Supervisor:** O sistema deve filtrar colaboradores pela permissão do supervisor.

## 2. Implementação no Frontend (`src/routes/_authenticated/nova-ausencia.tsx`)
- **Bloqueio de Modo Manual Indevido:**
    - Se a busca retornar 1+ resultados elegíveis, o botão "Preencher manualmente" não deve ser oferecido como fallback direto se a matrícula coincidir.
    - Adicionar validação no `searchMatricula`: se encontrar candidatos, forçar a escolha de um deles.
- **Diálogo de Seleção:** Melhorar o `Dialog` de múltiplos vínculos para exibir claramente Empresa e Projeto, auxiliando o supervisor na escolha correta.
- **Reset de Estado:** Garantir que ao selecionar um colaborador, o formulário saia do modo manual e limpe campos manuais.

## 3. Implementação no Backend (`src/lib/ausencias.functions.ts`)
- **Find-Before-Create Forense:**
    - No `createAusencia` (handler manual), antes de qualquer inserção, realizar uma busca por `matricula + empresa_id`.
    - Se encontrar um colaborador, converter silenciosamente o lançamento de MANUAL para AUTOMATICO (associando o `colaborador_id`).
- **Prevenção de Duplicidade:**
    - Após resolver a identidade do colaborador (seja via payload ou busca interna), validar se já existe ausência para a mesma data/regra.
    - Retornar erro `CONFLICT` específico com a mensagem solicitada.

## 4. Testes e Validação
- Testar com Supervisor CREDSYSTEM DF pesquisando matrícula 274.
- Validar que ele vê apenas o vínculo correto ou, se vir ambos, que a RLS/RBAC impeça a seleção indevida.
- Verificar que o lançamento manual para matrícula existente é interceptado e reaproveita o cadastro.

## Detalhes Técnicos
- **Frontend:** Atualizar `toggleModoManual` para verificar se há resultados pendentes.
- **Backend:** Inserir lógica de "Identity Resolution" no início do handler de `createAusencia`.
- **Mensagens:** Padronizar retornos conforme especificação na Etapa 8.
