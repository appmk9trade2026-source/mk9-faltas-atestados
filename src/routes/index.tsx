import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * CRM MK9 — ETAPA 8.1
 * DIAGNÓSTICO DO HTTP 400 E PREPARAÇÃO DO SEGUNDO TESTE REAL P0
 *
 * CONTEXTO
 *
 * O primeiro teste real autorizado foi executado:
 *
 * Test Run:
 * TR-8-REAL-001
 *
 * Resultado:
 * HTTP 400 — FALHA PERMANENTE CONTROLADA
 *
 * O comportamento de segurança foi correto:
 *
 * - Worker permaneceu estável;
 * - não houve retry infinito;
 * - Fail-Closed preservado;
 * - Idempotência preservada;
 * - PII Guardrail preservado;
 * - fluxo passou pela arquitetura oficial.
 *
 * PORÉM:
 *
 * A entrega real ainda NÃO foi homologada.
 *
 * OBJETIVO
 *
 * Identificar a causa EXATA do HTTP 400 antes de realizar qualquer novo envio.
 *
 * NÃO ativar produção.
 * NÃO liberar P1.
 * NÃO executar novo envio automaticamente.
 *
 * ==================================================
 * 1 — PRESERVAR ESTADO SEGURO
 * ==================================================
 *
 * Antes de qualquer análise confirmar:
 *
 * Environment:
 * SANDBOX
 *
 * Kill Switch:
 * OFF
 *
 * P1 externo:
 * OFF
 *
 * Nenhuma chamada externa deve ocorrer durante o diagnóstico.
 *
 * ==================================================
 * 2 — AUDITAR A RESPOSTA HTTP 400
 * ==================================================
 *
 * Analisar de forma sanitizada:
 *
 * - endpoint utilizado;
 * - método HTTP;
 * - estrutura esperada pela integração Evolution existente;
 * - campos obrigatórios;
 * - formato do destinatário;
 * - configuração da instance;
 * - estrutura do payload;
 * - resposta/código seguro retornado pela Evolution API.
 *
 * NÃO exibir:
 *
 * API key
 * token
 * Authorization
 * telefone completo
 * secrets
 * headers sensíveis.
 *
 * ==================================================
 * 3 — CLASSIFICAR A CAUSA RAIZ
 * ==================================================
 *
 * Determinar exatamente uma classificação principal:
 *
 * A — DESTINATÁRIO INVÁLIDO
 *
 * B — FORMATO DO DESTINATÁRIO INCORRETO
 *
 * C — PAYLOAD INVÁLIDO
 *
 * D — INSTANCE INCORRETA/INDISPONÍVEL
 *
 * E — ENDPOINT/CONTRATO INCORRETO
 *
 * F — CONFIGURAÇÃO DA EVOLUTION API
 *
 * G — OUTRA CAUSA COMPROVADA
 *
 * Não assumir que HTTP 400 significa automaticamente telefone inválido.
 *
 * Usar evidência da resposta real.
 *
 * ==================================================
 * 4 — VALIDAR O ADAPTER EXISTENTE
 * ==================================================
 *
 * Comparar o envio da Etapa 8 com chamadas já existentes e comprovadamente
 * funcionais da integração Evolution API no projeto.
 *
 * Verificar se o Worker está reutilizando corretamente:
 *
 * - endpoint;
 * - instance;
 * - autenticação;
 * - formato do número;
 * - body;
 * - headers necessários;
 * - contrato da versão utilizada.
 *
 * NÃO criar uma segunda implementação da Evolution API.
 *
 * ==================================================
 * 5 — VALIDAR DESTINATÁRIO
 * ==================================================
 *
 * Verificar o destinatário técnico cadastrado.
 *
 * Confirmar:
 *
 * active = true
 * is_test_recipient = true
 * environment = SANDBOX
 * formato válido conforme integração
 * destino tecnicamente utilizável
 *
 * Mostrar no relatório SOMENTE versão mascarada.
 *
 * NÃO alterar o número automaticamente.
 *
 * Se o destino estiver incorreto:
 *
 * informar que é necessária correção administrativa.
 *
 * ==================================================
 * 6 — CORREÇÃO
 * ==================================================
 *
 * Se a causa raiz for comprovada:
 *
 * realizar somente a correção mínima necessária.
 *
 * Exemplos:
 *
 * formatação
 * mapping do adapter
 * campo obrigatório
 * contrato do payload
 * configuração do recipient
 *
 * NÃO:
 *
 * refatorar Worker;
 * alterar Alert Engine;
 * alterar Outbox;
 * alterar Nova Ausência;
 * alterar Dashboard;
 * alterar regras de negócio;
 * trocar Evolution API.
 *
 * ==================================================
 * 7 — TESTES SEM ENVIO
 * ==================================================
 *
 * Após a correção executar:
 *
 * contract test
 * adapter test
 * recipient validation
 * pre-flight
 * DRY RUN
 *
 * Esperado:
 *
 * todos PASSAM.
 *
 * O DRY RUN NÃO chama Evolution API.
 *
 * ==================================================
 * 8 — REGRESSÃO
 * ==================================================
 *
 * Executar toda suíte aplicável.
 *
 * Baseline anterior deve permanecer preservado.
 *
 * Se houver regressão:
 *
 * NÃO prosseguir.
 *
 * ==================================================
 * 9 — NÃO REALIZAR SEGUNDO ENVIO
 * ==================================================
 *
 * Mesmo que tudo passe:
 *
 * NÃO executar o segundo WhatsApp automaticamente.
 *
 * Entregar primeiro:
 *
 * PRONTO PARA SEGUNDO TESTE REAL:
 * SIM/NÃO
 *
 * Aguardar autorização explícita.
 *
 * ==================================================
 * RELATÓRIO OBRIGATÓRIO
 * ==================================================
 *
 * ETAPA 8.1 — DIAGNÓSTICO HTTP 400
 *
 * Test Run analisado:
 * TR-8-REAL-001
 *
 * HTTP:
 * 400
 *
 * Environment:
 * SANDBOX
 *
 * Kill Switch:
 * OFF
 *
 * P1 externo:
 * OFF
 *
 * --------------------------------
 * CAUSA RAIZ
 * --------------------------------
 *
 * Classificação:
 * [A/B/C/D/E/F/G]
 *
 * Descrição técnica sanitizada:
 * [...]
 *
 * Evidência:
 * [...]
 *
 * Destinatário mascarado:
 * [...]
 *
 * Destinatário válido:
 * SIM/NÃO
 *
 * Instance válida:
 * SIM/NÃO
 *
 * Endpoint correto:
 * SIM/NÃO
 *
 * Payload correto:
 * SIM/NÃO
 *
 * Adapter correto:
 * SIM/NÃO
 *
 * --------------------------------
 * CORREÇÃO
 * --------------------------------
 *
 * Correção necessária:
 * SIM/NÃO
 *
 * Arquivos alterados:
 * [...]
 *
 * Banco alterado:
 * SIM/NÃO
 *
 * Descrição:
 * [...]
 *
 * --------------------------------
 * VALIDAÇÃO
 * --------------------------------
 *
 * Contract Test:
 * PASSOU/FALHOU
 *
 * Adapter Test:
 * PASSOU/FALHOU
 *
 * Recipient Validation:
 * PASSOU/FALHOU
 *
 * Pre-flight:
 * READY/BLOCKED
 *
 * Dry Run:
 * PASSOU/FALHOU
 *
 * Regressão:
 * PASSOU/FALHOU
 *
 * --------------------------------
 * SEGURANÇA
 * --------------------------------
 *
 * Kill Switch:
 * OFF
 *
 * Provider Calls durante diagnóstico:
 * 0
 *
 * PII:
 * NÃO PRESENTE
 *
 * Secrets:
 * NÃO PRESENTES
 *
 * Produção:
 * NÃO ATIVADA
 *
 * --------------------------------
 * RESULTADO
 * --------------------------------
 *
 * PRONTO PARA SEGUNDO TESTE REAL:
 * SIM/NÃO
 *
 * NÃO executar segundo envio.
 * NÃO ativar PRODUCTION.
 * NÃO liberar P1.
 * Aguardar autorização explícita.
 */

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/dashboard', replace: true });
  },
});

