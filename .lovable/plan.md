# CRM MK9 — INCIDENTE OCORRÊNCIAS DE PONTO AMBEV
## "INVALID UUID" NO CAMPO SUPERVISOR — MODO MANUAL

### OBJETIVO
Corrigir o erro "Invalid uuid" que ocorre no campo Supervisor ao protocolar uma nova ocorrência de ponto AMBEV no modo manual, garantindo que o `supervisor_usuario_id` seja corretamente preenchido e validado.

### ETAPAS DE EXECUÇÃO

#### 1. Diagnóstico e Ajuste do Schema (UI)
- **Arquivo:** `src/routes/_authenticated/ocorrencias-ponto.tsx`
- **Ação:** No `ocorrenciaPontoSchema`, o campo `supervisor_usuario_id` está como `uuid` (obrigatório). Verificaremos se o formulário está tentando enviar uma string vazia `""` quando o supervisor não é selecionado ou se o valor default `roles.includes("supervisor") ? user?.id : ""` está sendo invalidado pelo Zod.
- **Correção:** Ajustar o `defaultValues` para garantir que `supervisor_usuario_id` nunca seja uma string vazia se o usuário for um supervisor.

#### 2. Auto-Identificação do Supervisor
- **Arquivo:** `src/routes/_authenticated/ocorrencias-ponto.tsx`
- **Ação:** Implementar um `useEffect` que, ao detectar que o usuário logado tem a role `supervisor`, preencha automaticamente o campo `supervisor_usuario_id` com o ID do usuário logado e mantenha o campo desabilitado ou oculto se necessário.
- **Regra:** Se o usuário for Supervisor, ele é o responsável direto.

#### 3. Melhoria na Seleção de Supervisor para Coordenador/RH
- **Arquivo:** `src/routes/_authenticated/ocorrencias-ponto.tsx`
- **Ação:** Garantir que a lista de supervisores carregada para o projeto (`getSupervisoresProjeto`) retorne UUIDs válidos e que a UI não permita a submissão se nenhum supervisor for selecionado.
- **UX:** Substituir a mensagem genérica "Invalid uuid" por "Selecione um supervisor para continuar."

#### 4. Validação e Normalização no Servidor
- **Arquivo:** `src/lib/ocorrencias.functions.ts`
- **Ação:** Garantir que o `inputValidator` da server function `criarOcorrencia` trate corretamente os UUIDs recebidos, evitando falhas silenciosas de cast.
- **Segurança:** Validar se o `supervisor_usuario_id` enviado realmente pertence ao projeto/empresa indicado.

#### 5. Verificação Guardrail P0
- **Arquivo:** `src/routes/index.tsx`
- **Ação:** Confirmar que o arquivo continua sendo um REDIRECIONAMENTO PURO.

### GUARDRAILS
- **Home (`src/routes/index.tsx`):** INALTERADO (Pure Redirect).
- **Dashboard:** INALTERADO.
- **Relatórios:** INALTERADO.
- **Modo Manual:** Preservar `colaborador_id: null`.

### TESTES
- **Teste A:** Supervisor logado -> Modo Manual -> Verificar preenchimento automático de Supervisor -> Protocolar.
- **Teste B:** Coordenador logado -> Selecionar Supervisor -> Modo Manual -> Protocolar.
- **Teste C:** Tentar protocolar sem selecionar Supervisor (deve dar erro amigável, não "Invalid uuid").
