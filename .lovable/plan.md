# Plano de Ação — Etapa 8.9: Homologação do Canal Evolution e da Instância

Este plano estabelece o protocolo de auditoria e governança para a Etapa 8.9, focando na separação entre a infraestrutura interna do CRM (já homologada no TR-8-REAL-004) e a conectividade externa da Evolution API.

## Objetivos
- Manter o congelamento de disparos (Kill Switch OFF).
- Auditar a saúde da instância `coordenadormk9` de forma read-only.
- Identificar evidências históricas de sucesso no canal WhatsApp.
- Reclassificar semanticamente o estado de entrega e verificação administrativa.

## Etapas de Execução

### 1. Governança e Segurança
- Confirmar `Environment = SANDBOX` e `Kill Switch = OFF`.
- Garantir que `Production = OFF` e `P1 Externo = OFF`.
- **Proibição**: Nenhum novo Test Run (TR-8-REAL-005) está autorizado.

### 2. Auditoria da Instância (Read-Only)
- Criar script de auditoria técnico para verificar o estado da instância na Evolution API v2.3.7.
- Consultar endpoints administrativos (não destrutivos) para obter versão, status de conexão e autenticação.
- Registrar se a instância está conectada ou se apresenta falhas de sessão.

### 3. Busca por Evidência Histórica
- Consultar a tabela `operational_notification_attempts` em busca de qualquer registro anterior com `result = SUCCESS` ou `provider_message_id` válido.
- Verificar se a mesma instância `coordenadormk9` já operou funcionalmente no passado.

### 4. Gestão de Memória e Documentação
- Atualizar `mem://index.md` com a nova feature memory: `p0-etapa-8-9-homologacao-canal.md`.
- Criar `mem://features/p0-etapa-8-9-homologacao-canal.md` com o relatório forense consolidado.
- Reforçar o Guardrail P0: `src/routes/index.tsx` permanece como redirecionamento puro.

## Detalhes Técnicos
- **Script de Auditoria**: `/tmp/browser/audit_evolution_instance.ts` para consulta via `fetch`.
- **Filtros do Worker**: Manter o bloqueio `Fail-Closed` para destinatários não verificados ou instâncias offline.
- **Normalização**: Preservar `normalizeEvolutionNumber` (apenas dígitos).

## Verificação
- O sucesso desta etapa é medido pela precisão do diagnóstico do canal, não pelo envio de mensagens.
- O sistema deve permanecer em estado `READY` ou `BLOCKED` conforme a realidade técnica, sem intervenção manual para "forçar" sucesso.
