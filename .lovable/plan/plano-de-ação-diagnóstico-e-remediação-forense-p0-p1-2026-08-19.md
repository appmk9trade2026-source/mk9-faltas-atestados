# Plano de Ação — Diagnóstico e Remediação Forense P0/P1

Este plano estabelece o protocolo para investigar e corrigir a falha persistente na retificação de ausências (Meio Período), identificada pelo Safe Code **2F7F1193** e Protocolo **AMBEVASD5-20260818-000068**.

## Objetivo
Investigar a causa raiz do erro "Não foi possível retificar" que persiste mesmo após a aplicação da correção de schema, garantindo que a retificação de Meio Período (Horas) seja 100% operacional e persistente.

## Etapas Técnicas

### 1. Investigação Forense (Fonte de Verdade)
- **Safe Code Analysis:** Localizar a exceção original server-side associada ao código `2F7F1193` nos logs do servidor.
- **Database Inspection:** Verificar o estado atual do protocolo `AMBEVASD5-20260818-000068` na tabela `public.ausencias` e `public.ausencia_retificacoes`.
- **RPC Verification:** Validar a assinatura e o corpo da função `public.retificar_ausencia` diretamente no banco de dados para detectar drift entre código e produção.

### 2. Remediação de Schema e Contrato
- **Align Types:** Garantir que o casting de `time` na RPC e os tipos no Zod (`src/lib/retificacao.functions.ts`) estejam em sincronia absoluta.
- **Audit Persistence:** Confirmar se todos os 15 parâmetros da RPC estão sendo corretamente mapeados para o `INSERT` na tabela de histórico.

### 3. Fortalecimento da UI/UX
- **Traceability:** Melhorar a exibição do Safe Code para facilitar o suporte, sem expor detalhes técnicos ao usuário final.
- **Validation:** Refinar a validação de horários (fim > início) no frontend para evitar submissões inválidas.

### 4. Homologação Real (Ponta a Ponta)
- **Reproduction:** Executar um teste real com o cenário exato da falha (Atestado de Comparecimento, Meio Período, 12:30 -> 18:30).
- **Verification:** Confirmar via SQL que os dados foram persistidos corretamente em ambas as tabelas e que o documento foi associado.

## Detalhes Técnicos (Para Desenvolvedores)
- **Tabela:** `public.ausencia_retificacoes`
- **RPC:** `public.retificar_ausencia`
- **Campos Críticos:** `horario_inicio_novo`, `horario_fim_novo`, `p_horario_inicio`, `p_horario_fim`.
- **Zod Schema:** `retificarSchema` em `src/lib/retificacao.functions.ts`.

## Critério de Aceite
- Sucesso na retificação do protocolo `AMBEVASD5-20260818-000068`.
- Persistência confirmada de horários na tabela de histórico.
- Dashboard de Estabilidade refletindo status PASS após teste real bem-sucedido.
