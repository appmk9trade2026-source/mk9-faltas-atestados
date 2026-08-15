# Plano de Correção: P0 Falso Conflito Cancelado/Excluído

## 1. Explore e Diagnóstico
- **Etapa 1: Reproduzir no Banco** - Executar `detectar_conflitos_ausencia` via `psql` para a matrícula 2625 no período 11/08/2026.
- **Etapa 2: Auditar Função Real** - Extrair a definição de `public.detectar_conflitos_ausencia` via `pg_proc` para identificar falhas na filtragem de status.
- **Etapa 3: Mapear Barreiras** - Localizar todas as ocorrências da mensagem de erro de duplicidade no código e banco (Triggers, RPCs, Server Functions).

## 2. Implementação e Correção
- **Etapa 4: Ajustar Lógica de Conflito** - Refinar a filtragem para ignorar explicitamente `status = 'CANCELADO'`, `status_documental = 'EXCLUIDO'` e `excluida_em IS NOT NULL`.
- **Etapa 5: Migration Cirúrgica** - Aplicar nova migration substituindo a função RPC ou corrigindo a camada identificada como causadora do falso positivo.

## 3. Validação e Homologação
- **Etapa 6: Testes Unitários e Manuais** - Validar que registros ativos continuam bloqueando, enquanto cancelados/excluídos permitem o lançamento.
- **Etapa 7: Relatório Final** - Documentar a causa raiz, camada corrigida e evidência de sucesso para o caso Karina (2625).

## Detalhes Técnicos
- O foco é a integridade da RPC `public.detectar_conflitos_ausencia` e possíveis triggers de banco (`trg_ausencias_bloqueia_duplicidade`).
- Manutenção rigorosa do Guardrail P0: `src/routes/index.tsx` permanece um redirect puro.
