# Plano de Evolução UX: Nova Ausência

Este plano visa eliminar o "bloqueio silencioso" no formulário de Nova Ausência, garantindo que o Supervisor identifique imediatamente campos pendentes e consiga finalizar o lançamento sem frustrações.

## Alterações de Interface (UI)

### 1. Hardening do Checkbox de Confirmação Legal
- **Orientação Explícita**: Adicionar texto auxiliar ao lado do checkbox: "Para enviar o lançamento, confirme que as informações acima estão corretas."
- **Feedback de Erro Visual**: Em caso de tentativa de envio sem marcar, a área será destacada em vermelho com mensagem de validação clara.
- **Scroll Automático**: A página rolará suavemente até o checkbox se ele for o impeditivo.

### 2. Visibilidade de Campos Obrigatórios
- **Sinalização Visual Consistentemente**: Todos os campos Zod-obrigatórios receberão o asterisco vermelho `*` e labels claros.
- **Feedback de "Acidente de Trabalho"**: Substituição da validação genérica por uma mensagem específica: "Informe se a ausência está relacionada a acidente de trabalho."

### 3. Mecanismo de Foco e Scroll
- **Auto-Navegação**: Ao clicar em "Enviar Lançamento" com erros, o sistema identificará o primeiro campo inválido e executará um `scrollIntoView` suave, focando o campo para correção imediata.

### 4. Melhoria no Botão de Envio
- **Estado Dinâmico**: O botão permanecerá clicável (para disparar validações), mas apresentará um resumo visual se houver pendências, removendo o Tooltip restritivo e substituindo por validação em tela (inline).
- **Acessibilidade**: Implementação de `aria-invalid` e `aria-describedby` em todos os campos monitorados.

## Detalhes Técnicos

- **Arquivo Principal**: `src/routes/_authenticated/nova-ausencia.tsx`
- **Componente de Apoio**: `src/components/ausencias/dados-colaborador-fields.tsx`
- **Lógica de Validação**: Utilização da API `formState.errors` do `react-hook-form` para orquestrar o scroll.
- **Mobile First**: Otimização dos alinhamentos para 360px e 390px, garantindo que as mensagens de erro não quebrem o layout.

## Segurança e Regras de Negócio
- Nenhuma alteração em tabelas, RPCs, RLS ou infraestrutura de backend.
- Preservação integral do protocolo de teste `AMBEVASD5-20260814-000057`.
- Manutenção da política de Redirecionamento da Home (Guardrail P0).
