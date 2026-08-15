# Plano de Estabilização - Etapa 8: Go-Live Controlado P0

Preparação para o go-live real das notificações críticas (P0) com governança, kill switch e auditoria.

## Fase A: Infraestrutura Segura

### 1. Governança e Configuração (Banco de Dados)
- [ ] Criar tabela `public.operational_notification_config` para Kill Switch e Ambiente (DISABLED/SANDBOX/PRODUCTION).
- [ ] Criar tabela `public.operational_notification_recipients` para destinatários técnicos verificados.
- [ ] Implementar RLS rigoroso (apenas `super_admin`).
- [ ] Criar função `public.has_verified_recipient(channel, environment)` para proteção Fail-Closed.

### 2. Lógica de Controle (Server-side)
- [ ] **src/lib/health-worker.server.ts**: 
    - Integrar Kill Switch e Controle de Ambiente.
    - Implementar regra Fail-Closed (bloqueia se config ausente).
    - Mapear destinatários reais da tabela `recipients` baseado no ambiente.
- [ ] **src/lib/health.server.ts**: 
    - Adicionar modo `DRY_RUN` para o Alert Engine.
- [ ] **src/lib/health.functions.ts**:
    - Adicionar server functions para gerenciar Kill Switch e Destinatários.
    - Implementar `validateNotificationGoLive` (Pre-flight check).

### 3. Interface Administrativa (Frontend)
- [ ] **src/routes/saude-sistema.tsx**:
    - Adicionar painel "Notificações P0".
    - Controles de Kill Switch (com confirmação).
    - Gestão de Destinatários (mascarados).
    - Botão de Pre-flight check e Preview de mensagem técnica.

### 4. Segurança e Auditoria
- [ ] Garantir que PII nunca vaza para logs ou provedor (CID, Nome, CPF).
- [ ] Auditoria completa de todas as mudanças de estado (Kill Switch ON/OFF).

## Homologação
- [ ] Executar bateria de 122 testes existentes + novos testes da Etapa 8.
- [ ] Executar Dry Run e Pre-flight.
- [ ] Relatar "PRONTO PARA TESTE REAL".

---
*P1 continua bloqueado para envio externo.*
