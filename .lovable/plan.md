# Plano de Estabilização - Etapa 8.15: Cadastro de Destinatário Técnico

Este plano estabelece o fluxo de governança para inclusão e homologação de novos destinatários técnicos no ambiente de Sandbox, garantindo que notificações críticas P0 possam ser testadas com segurança antes do go-live real.

## Alterações Técnicas

### Backend & Segurança
- **Serviço de Configuração:** Implementação da função `addTechnicalRecipient` em `src/lib/health-config.functions.ts` com validação estrita de `super_admin`.
- **Normalização:** Tratamento automático de números para formato canônico (apenas dígitos).
- **Idempotência:** Verificação de duplicidade e capacidade de reativação de números inativos.
- **Auditoria:** Registro automático em `operational_notification_recipient_audit` para cada ação administrativa.

### Interface (Painel de Saúde)
- **Modal de Cadastro:** Novo Dialog em `/saude-sistema` com confirmações obrigatórias de natureza técnica e status do WhatsApp.
- **Gestão de Verificação:** Botões integrados para Homologação Administrativa e Revogação.
- **Restrição de Acesso:** Visibilidade e execução restritas a Super Admins.

## Roteiro de Verificação
1. **Verificação de Permissão:** Confirmar que usuários sem role `super_admin` não visualizam o botão nem podem executar a função.
2. **Teste de Normalização:** Inserir números com máscaras (ex: `+55 (11) 9...`) e validar que o banco armazena apenas `55119...`.
3. **Teste de Bloqueio:** Tentar cadastrar um número ativo e validar a mensagem de erro de duplicidade.
4. **Homologação Dry Run:** Validar que novos números registrados em Sandbox aparecem na lista mas exigem o check "Verificar" antes de permitirem o envio real.
