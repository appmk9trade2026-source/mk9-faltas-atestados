# Plano de Implementação — Etapa 8.3: Auditoria Forense da Evolution API

Este plano descreve o protocolo diagnóstico para identificar a causa raiz dos erros HTTP 400 em `SANDBOX`, sem disparar novas mensagens reais.

## Objetivos
- Descobrir a causa técnica real do HTTP 400.
- Executar auditoria 100% read-only/offline.
- Comparar o fluxo do Worker P0 com integrações funcionais existentes.

## Etapas Técnicas

### 1. Auditoria Forense de Evidências (Read-Only)
- **Localizar IDs:** Recuperar IDs de Incident, Alert, Outbox e Attempt para `TR-8-REAL-001` e `TR-8-REAL-002`.
- **Corpo da Resposta:** Tentar recuperar o corpo real da resposta HTTP 400 (sanitizado) das tabelas de logs/attempts.
- **Request Shape:** Reconstruir o payload JSON enviado pelo Worker e pelo Adapter.

### 2. Análise de Integração e Contratos
- **Comparação de Adapter:** Auditar `src/lib/health-worker.server.ts` vs `src/lib/evolution-api.server.ts`.
- **Benchmarking Interno:** Localizar e auditar a integração WhatsApp que já funciona (ex: `src/routes/api/public/hooks/process-whatsapp-outbox.ts`).
- **Verificação de Contrato:** Validar se o endpoint `POST /message/sendText/{instance}` espera um body diferente do que está sendo enviado (ex: nesting de campos, nomes de propriedades, tipos).

### 3. Diagnóstico de Instância e Normalização
- **Configuração da Instância:** Verificar status da instância `coordenadormk9` (sem reiniciar ou reconectar).
- **Normalização do Número:** Comparar formatos (`+`, DDI, sufixos `@s.whatsapp.net`) entre o fluxo funcional e o Worker P0.

### 4. Resultados e Próximos Passos
- Gerar relatório forense detalhado conforme os 19 pontos solicitados.
- Se a causa raiz for comprovada, propor correção mínima.
- **PRÓXIMO TESTE REAL:** Bloqueado até autorização explícita pós-diagnóstico.

## Guardrails
- **Kill Switch:** Deve permanecer `OFF`.
- **Environment:** `SANDBOX`.
- **Home Protection:** `src/routes/index.tsx` permanece como redirecionamento puro.
- **Provider Calls:** 0.
