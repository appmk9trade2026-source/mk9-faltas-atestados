# Plano de Implementação: Fase 6 — Centro de Inteligência de Incidentes

Implementação do Centro de Inteligência para detecção determinística de recorrências e incidentes sistêmicos baseada em Safe Codes e metadados operacionais.

## 1. Backend & Data Model (Supabase)
- Criar tabela `support_incidents` para registro central de incidentes (INC-YYYYMMDD-XXXX).
- Criar tabela `support_incident_tickets` para vinculação N:M (chamado ↔ incidente).
- Implementar triggers para geração de protocolo e auditoria.
- Definir políticas de RLS e GRANTs (Super Admin full, RH limitado).

## 2. Motor de Detecção Determinística
- Desenvolver View/RPC `detect_potential_incidents` que analisa:
  - Mesmo `safe_code` + mesmo `source_module`.
  - Janelas temporais (30/60 min).
  - Thresholds: 3 chamados (Atenção), 5 chamados (Potencial).
- Implementar lógica de Fingerprint (`module:safe_code:category`) para deduplicação.

## 3. Interface Administrativa
- Criar nova rota `/suporte/incidentes`.
- Desenvolver dashboard de incidentes com KPIs (ativos, impactados, tendência).
- Implementar `IncidentDetailsDrawer` com timeline de detecção e vínculo de tickets.
- Adicionar gate humano para confirmação de incidentes POTENTIAL → CONFIRMED.

## 4. Integração Operacional & UX
- Adicionar alerta visual de "Possível relação com incidente" no `TicketDetailsDrawer` existente.
- Implementar fluxo de vinculação manual/desvinculação auditada.
- Integrar Copiloto MK9 para sumários de incidentes (modo assistivo).

## Detalhes Técnicos
- **Privacidade**: Fingerprints baseados apenas em metadados técnicos; PII (CPF/Nome) proibido na correlação.
- **Performance**: Uso de índices compostos em `(source_module, safe_code, created_at)` e queries agregadas.
- **Observabilidade**: Eventos de auditoria dedicados para cada transição de estado do incidente.
