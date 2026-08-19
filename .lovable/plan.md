# Plano de Correção: Retificação de Ausência — Meio Período (Horas)

Este plano visa corrigir o contrato de retificação para suportar ausências baseadas em horas (Meio Período), alinhando UI, Zod, Server Function e a RPC no banco de dados.

## Etapas Técnicas

### 1. Banco de Dados (RPC)
Evoluir a RPC `public.retificar_ausencia` para aceitar os parâmetros opcionais `p_horario_inicio` e `p_horario_fim`. A RPC deve persistir esses valores na tabela `public.ausencias` quando fornecidos.

### 2. Contrato de Validação (Zod)
Atualizar o schema `retificarSchema` em `src/lib/retificacao.functions.ts` para incluir os campos:
- `horario_inicio`: string (HH:mm) opcional.
- `horario_fim`: string (HH:mm) opcional.

### 3. Server Function
Ajustar a função `retificarAusencia` em `src/lib/retificacao.functions.ts` para capturar esses novos campos do payload validado e encaminhá-los para a chamada da RPC.

### 4. Interface (UI)
Modificar o componente `RetificarAusenciaDialog` em `src/components/ausencias/retificar-ausencia-dialog.tsx`:
- Adicionar campos de entrada para "Horário Inicial" e "Horário Final".
- Exibir estes campos condicionalmente quando o período selecionado for do tipo "MEIO_PERIODO".
- Implementar validação visual e de estado: horários obrigatórios para meio período, e horário final deve ser posterior ao inicial.

### 5. Verificação e Homologação
Executar bateria de testes (RET-001 a RET-008) conforme especificado no protocolo, garantindo que o fluxo "Nova Ausência" e outros processos permaneçam íntegros.

## Technical Details
- **Database**: Migration using `CREATE OR REPLACE FUNCTION` to preserve compatibility with existing callers (default NULL for new params).
- **Zod**: Regex validation for time format `/^\d{2}:\d{2}(:\d{2})?$/`.
- **UI**: Integration with `shadcn/ui` components (Input, Label) following existing design patterns.
