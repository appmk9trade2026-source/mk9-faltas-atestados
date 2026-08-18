# Plano de Melhoria UX — Duplicidade de Ausência e Idempotência

Corrigir o erro visual de HTML bruto reportado pelo Supervisor Carlos através de idempotência no servidor e enriquecer a experiência do usuário em casos de duplicidade real, exibindo detalhes sobre quem realizou o lançamento conflitante.

## Detalhes Técnicos

### 1. Idempotência Server-side
- Modificar `createAusencia` em `src/lib/ausencias.functions.ts` para verificar se já existe uma ausência com o mesmo `correlation_id` (enviado pelo frontend).
- Se encontrar, retornar o resultado original com o código `ALREADY_COMMITTED` em vez de tentar um novo `INSERT`.
- Garantir que o `Audit Event` não seja duplicado em retries bem-sucedidos.

### 2. Enriquecimento de Duplicidade (DUPLICATE_PERIOD)
- Atualizar a lógica de verificação de conflitos no servidor para buscar metadados do registro conflitante (Protocolo, Tipo, Período, Registrado por, Data/Hora, Origem).
- Resolver o nome e o papel do registrador a partir da tabela `profiles`.
- Retornar uma estrutura de erro estendida que inclua o objeto `existing_record` em caso de `CONFLICT`.

### 3. Taxonomia de Erros e HTML Guard
- Adicionar o código `ALREADY_COMMITTED` ao `RBAC_ERROR_CODES` em `src/lib/rbac/errors.ts`.
- No frontend (`src/routes/_authenticated/nova-ausencia.tsx`), tratar `ALREADY_COMMITTED` como sucesso.
- Implementar um "HTML Guard" no `onError` da mutação para interceptar respostas que comecem com `<!doctype html>` ou `<html>`, convertendo-as em mensagens amigáveis de "Falha na confirmação do servidor" em vez de exibir o código fonte.

### 4. UX e Proteção de Duplo Clique
- Desabilitar o botão de submissão e mostrar estado de carregamento durante a mutação no frontend.
- Criar um novo diálogo/alerta em `NovaAusenciaPage` que exiba de forma organizada os dados do lançamento conflitante quando o backend retornar `DUPLICATE_PERIOD`.

## Etapas de Implementação

1. **Schema e Erros**: Atualizar `src/lib/rbac/errors.ts` com novos códigos.
2. **Lógica de Servidor**:
   - Refatorar `createAusencia` em `src/lib/ausencias.functions.ts` para suportar idempotência via `correlation_id`.
   - Implementar a busca de metadados em `checkConflitosSeguro` ou após a detecção do conflito.
3. **Frontend**:
   - Atualizar a mutação `salvarMut` em `src/routes/_authenticated/nova-ausencia.tsx` para tratar os novos estados.
   - Adicionar o estado de "Enviando..." ao botão de submit.
   - Implementar o componente visual para exibir os dados da duplicidade.

---
**Restrição P0**: `src/routes/index.tsx` permanece intocado (redirecionamento puro).
**Segurança**: Dados sensíveis (CPF, CID, anexos) do registro conflitante nunca serão expostos a usuários sem permissão.
