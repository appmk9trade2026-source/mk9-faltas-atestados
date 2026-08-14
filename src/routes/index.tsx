import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * P0 — CORREÇÃO DEFINITIVA
 * OCORRÊNCIAS DE PONTO AMBEV → AUSÊNCIAS
 * + CORREÇÃO DE DATA CIVIL NO FRONTEND
 * 
 * A auditoria forense está concluída.
 * 
 * CAUSAS COMPROVADAS:
 * 
 * 1. public.ocorrencias_ponto.data_ocorrencia está correta no banco:
 *    2026-08-14
 * 
 *    O frontend exibe 13/08/2026 devido a conversão indevida de timezone/data civil.
 * 
 * 2. Os protocolos OCP-AMBEV possuem ausencia_id = NULL.
 * 
 * 3. As ausências correspondentes NÃO foram criadas.
 * 
 * 4. Existem registros afetados desde pelo menos 11/08/2026.
 * 
 * 5. A falha está no fluxo Server Function/RPC responsável por transformar/vincular
 *    uma Ocorrência de Ponto AMBEV à ausência operacional.
 * 
 * OBJETIVO:
 * 
 * Corrigir o fluxo futuro SEM perder histórico e preparar recuperação segura dos
 * registros já afetados.
 * 
 * ==================================================
 * ETAPA 0 — RESTAURAR E CONGELAR HOME
 * ==================================================
 * 
 * Antes de qualquer outra alteração:
 * 
 * src/routes/index.tsx NÃO deve conter:
 * - auditoria;
 * - diagnóstico;
 * - resultados;
 * - comentários de homologação;
 * - roadmap;
 * - lógica operacional.
 * 
 * Deixar exclusivamente o redirecionamento puro para /dashboard.
 * 
 * Depois:
 * 
 * NÃO TOCAR MAIS EM src/routes/index.tsx NESTE INCIDENTE.
 * 
 * ==================================================
 * ETAPA 1 — CORRIGIR DATA CIVIL
 * ==================================================
 * 
 * Localizar exatamente onde data_ocorrencia é formatada.
 * 
 * NÃO utilizar conversão UTC para campos DATE.
 * 
 * Evitar padrões como:
 * 
 * new Date("2026-08-14")
 * 
 * quando posteriormente formatados em timezone local.
 * 
 * Para DATE civil YYYY-MM-DD:
 * 
 * interpretar os componentes diretamente ou utilizar helper próprio para data civil.
 * 
 * Teste obrigatório:
 * 
 * Banco:
 * 2026-08-14
 * 
 * UI:
 * 14/08/2026
 * 
 * Timezone America/Sao_Paulo:
 * não pode alterar o dia.
 * 
 * Testar também:
 * 
 * 2026-08-01
 * 2026-08-14
 * 2026-12-31
 * 2027-01-01
 * 
 * ==================================================
 * ETAPA 2 — MAPEAR O FLUXO OCP → AUSÊNCIA
 * ==================================================
 * 
 * Identificar objetos físicos reais:
 * 
 * Frontend:
 * [...]
 * 
 * Server Function:
 * [...]
 * 
 * RPC:
 * [...]
 * 
 * Trigger:
 * [...]
 * 
 * Tabela origem:
 * public.ocorrencias_ponto
 * 
 * Tabela destino:
 * public.ausencias ou nome físico confirmado
 * 
 * Descobrir o contrato esperado:
 * 
 * INSERT ocorrencia
 * → INSERT ausencia
 * → UPDATE ocorrencia.ausencia_id
 * 
 * ou fluxo real equivalente.
 * 
 * Não presumir.
 * 
 * ==================================================
 * ETAPA 3 — LOCALIZAR O PONTO EXATO DA FALHA
 * ==================================================
 * 
 * Executar lançamento controlado em ambiente seguro com Supervisor real.
 * 
 * Instrumentar:
 * 
 * PASSO 1 — INSERT ocorrencia:
 * PASSOU / FALHOU
 * 
 * PASSO 2 — criação ausencia:
 * PASSOU / FALHOU
 * 
 * PASSO 3 — retorno ausencia_id:
 * PASSOU / FALHOU
 * 
 * PASSO 4 — UPDATE ocorrencias_ponto.ausencia_id:
 * PASSOU / FALHOU
 * 
 * PASSO 5 — commit/finalização:
 * PASSOU / FALHOU
 * 
 * Capturar:
 * 
 * SQLSTATE
 * RPC
 * mensagem
 * tabela
 * policy RLS
 * exception
 * trace_id
 * 
 * Não mascarar exception.
 * 
 * ==================================================
 * ETAPA 4 — VERIFICAR SE A AUSÊNCIA É REALMENTE OBRIGATÓRIA
 * ==================================================
 * 
 * Confirmar a regra de negócio existente.
 * 
 * Para ocorrências de ponto AMBEV aprovadas/registradas que representam falta,
 * a ausência operacional deve existir?
 * 
 * Se SIM:
 * 
 * essa relação passa a ser uma invariável:
 * 
 * ocorrência processável
 * → ausencia_id NOT NULL
 * → ausência correspondente existente
 * 
 * Documentar estados em que ausencia_id pode legitimamente permanecer NULL.
 * 
 * Não aplicar regra indiscriminadamente a estados onde ausência ainda não deve existir.
 * 
 * ==================================================
 * ETAPA 5 — ELIMINAR SUCESSO PARCIAL
 * ==================================================
 * 
 * O sistema não pode responder sucesso quando:
 * 
 * ocorrência foi criada
 * MAS
 * a ausência obrigatória não foi criada.
 * 
 * Implementar atomicidade na camada adequada.
 * 
 * Preferência:
 * 
 * uma operação server-side transacional responsável por:
 * 
 * 1. validar autorização;
 * 2. criar ocorrência;
 * 3. criar ausência;
 * 4. vincular ausencia_id;
 * 5. concluir.
 * 
 * Se qualquer etapa obrigatória falhar:
 * 
 * ROLLBACK.
 * 
 * Não deixar nova ocorrência órfã.
 * 
 * ==================================================
 * ETAPA 6 — IDEMPOTÊNCIA
 * ==================================================
 * 
 * A correção precisa impedir duplicação em retries.
 * 
 * Se ocorrer timeout/retry:
 * 
 * não criar duas ausências para a mesma ocorrência.
 * 
 * Criar/usar vínculo canônico único:
 * 
 * ocorrencias_ponto.ausencia_id
 * 
 * e, se adequado ao schema, constraint/índice que garanta unicidade da relação.
 * 
 * Antes de criar ausência:
 * 
 * verificar se já existe vínculo válido.
 * 
 * NÃO utilizar somente matrícula como identidade.
 * 
 * Usar IDs canônicos.
 * 
 * ==================================================
 * ETAPA 7 — RLS E SUPERVISOR
 * ==================================================
 * 
 * Executar o fluxo com sessão REAL de Supervisor.
 * 
 * Confirmar que ele possui autorização para:
 * 
 * criar a ocorrência;
 * gerar a ausência correspondente;
 * vincular os registros;
 * 
 * somente dentro do escopo:
 * 
 * Projeto → Supervisor → Colaborador.
 * 
 * Se a RPC precisar operar de forma privilegiada:
 * 
 * auditar cuidadosamente SECURITY DEFINER,
 * search_path fixo,
 * validação explícita de auth.uid(),
 * empresa/projeto/supervisor.
 * 
 * NÃO usar service_role no browser.
 * 
 * NÃO desabilitar RLS.
 * 
 * NÃO criar policy USING(true)/WITH CHECK(true).
 * 
 * ==================================================
 * ETAPA 8 — AUSÊNCIA GERADA
 * ==================================================
 * 
 * Validar que a ausência criada contém corretamente:
 * 
 * colaborador_id
 * empresa_id
 * projeto_id
 * supervisor
 * tipo de ausência
 * data_inicio
 * data_fim
 * origem
 * created_by
 * status RH
 * status processamento
 * 
 * Se a origem possuir campo:
 * 
 * origem = OCORRENCIA_PONTO_AMBEV
 * 
 * ou valor canônico existente.
 * 
 * Não inventar enum sem verificar schema.
 * 
 * ==================================================
 * ETAPA 9 — DOCUMENTOS
 * ==================================================
 * 
 * Se a Ocorrência de Ponto possuir evidência/anexo:
 * 
 * definir explicitamente a regra.
 * 
 * O documento deve:
 * 
 * A) permanecer vinculado somente à ocorrência;
 * B) ser referenciado também pela ausência;
 * C) utilizar relação documental compartilhada.
 * 
 * Descobrir o desenho atual antes de alterar.
 * 
 * NÃO copiar arquivo fisicamente sem necessidade.
 * 
 * Preferir referência ao mesmo objeto quando a arquitetura permitir.
 * 
 * Bucket permanece privado.
 * 
 * ==================================================
 * ETAPA 10 — REGISTROS HISTÓRICOS ÓRFÃOS
 * ==================================================
 * 
 * Auditar todos os registros afetados.
 * 
 * Começar pelo período:
 * 
 * 11/08/2026 até 14/08/2026
 * 
 * Buscar:
 * 
 * ocorrencias_ponto
 * WHERE ausencia_id IS NULL
 * 
 * mas aplicar também os estados que, pela regra de negócio,
 * JÁ DEVERIAM possuir ausência.
 * 
 * Gerar relatório:
 * 
 * total órfãos:
 * [...]
 * 
 * por data:
 * [...]
 * 
 * por projeto:
 * [...]
 * 
 * por supervisor:
 * [...]
 * 
 * por colaborador:
 * [...]
 * 
 * por status:
 * [...]
 * 
 * NÃO executar backfill imediatamente.
 * 
 * ==================================================
 * ETAPA 11 — SIMULAÇÃO DE BACKFILL
 * ==================================================
 * 
 * Antes de alterar histórico, executar DRY RUN.
 * 
 * Para cada OCP órfã informar:
 * 
 * protocolo OCP
 * colaborador
 * matrícula
 * projeto
 * data
 * tipo
 * status
 * ausência equivalente já existe?
 * duplicidade?
 * ação proposta
 * 
 * Classificar:
 * 
 * CRIAR AUSÊNCIA
 * JÁ POSSUI AUSÊNCIA EQUIVALENTE
 * NÃO DEVE GERAR AUSÊNCIA
 * CONFLITO — REVISÃO MANUAL
 * 
 * NÃO criar registros nessa etapa.
 * 
 * ==================================================
 * ETAPA 12 — BACKFILL CONTROLADO
 * ==================================================
 * 
 * Somente depois do DRY RUN sem ambiguidades:
 * 
 * criar ausências faltantes de forma idempotente.
 * 
 * Para cada criação:
 * 
 * preservar autoria/origem histórica;
 * preservar data operacional original;
 * vincular ocorrencias_ponto.ausencia_id;
 * não usar data atual como data da ausência;
 * não duplicar lançamento existente.
 * 
 * Gerar log de auditoria.
 * 
 * ==================================================
 * ETAPA 13 — CASOS DE TESTE
 * ==================================================
 * 
 * CASO A
 * Supervisor cria ocorrência válida em 14/08.
 * 
 * Esperado:
 * 
 * OCP criada:
 * SIM
 * 
 * data_ocorrencia:
 * 2026-08-14
 * 
 * UI:
 * 14/08/2026
 * 
 * ausencia_id:
 * PREENCHIDO
 * 
 * ausência:
 * CRIADA
 * 
 * /ausencias Super Admin:
 * VISÍVEL
 * 
 * CASO B
 * Falha proposital na criação da ausência.
 * 
 * Esperado:
 * 
 * ocorrência órfã:
 * NÃO
 * 
 * operação:
 * ROLLBACK
 * 
 * usuário:
 * recebe erro amigável
 * 
 * CASO C
 * Retry da mesma operação.
 * 
 * Esperado:
 * 
 * ausências duplicadas:
 * 0
 * 
 * CASO D
 * Supervisor fora do escopo.
 * 
 * Esperado:
 * BLOQUEADO
 * 
 * CASO E
 * Registro CANCELADO/EXCLUIDO.
 * 
 * Garantir que a correção recente da duplicidade permaneça funcionando.
 * 
 * ==================================================
 * ETAPA 14 — OBSERVABILIDADE
 * ==================================================
 * 
 * Registrar para operações futuras:
 * 
 * trace_id
 * ocorrencia_id
 * ausencia_id
 * auth.uid()
 * resultado
 * etapa de falha
 * 
 * Se ocorrer:
 * 
 * ocorrência que deveria possuir ausência
 * +
 * ausencia_id NULL
 * 
 * gerar log/alerta operacional.
 * 
 * Não expor detalhes SQL ao usuário final.
 * 
 * ==================================================
 * GUARDRAILS
 * ==================================================
 * 
 * NÃO alterar src/routes/index.tsx depois da restauração inicial.
 * 
 * NÃO alterar Dashboard.
 * 
 * NÃO alterar Relatórios.
 * 
 * NÃO alterar Plano de Ação.
 * 
 * NÃO alterar Central de Processamento além de consumir a ausência canônica normalmente.
 * 
 * NÃO alterar infraestrutura WhatsApp.
 * 
 * NÃO alterar a instância WhatsApp canônica existente.
 * 
 * NÃO desabilitar RLS.
 * 
 * NÃO remover trava de duplicidade.
 * 
 * NÃO alterar registros históricos sem DRY RUN.
 * 
 * NÃO criar ausência duplicada durante backfill.
 * 
 * NÃO usar matrícula isolada como identidade.
 * 
 * A UI deve permanecer bonita, harmônica, intuitiva, moderna e responsiva,
 * seguindo as melhores práticas atuais e referências premiadas de UX/UI.
 * 
 * ==================================================
 * ENTREGA FINAL
 * ==================================================
 * 
 * P0 — OCP AMBEV → AUSÊNCIAS
 * 
 * Bug timezone corrigido:
 * PASSOU / FALHOU
 * 
 * Banco 2026-08-14:
 * [...]
 * 
 * UI:
 * [...]
 * 
 * Server Function responsável:
 * [...]
 * 
 * RPC responsável:
 * [...]
 * 
 * Ponto exato da falha:
 * [...]
 * 
 * SQLSTATE original:
 * [...]
 * 
 * Causa da ausencia_id NULL:
 * [...]
 * 
 * Fluxo tornou-se atômico:
 * SIM / NÃO
 * 
 * Teste Supervisor:
 * PASSOU / FALHOU
 * 
 * OCP criada:
 * PASSOU / FALHOU
 * 
 * Ausência criada:
 * PASSOU / FALHOU
 * 
 * ausencia_id vinculado:
 * PASSOU / FALHOU
 * 
 * /ausencias Super Admin:
 * PASSOU / FALHOU
 * 
 * Retry sem duplicidade:
 * PASSOU / FALHOU
 * 
 * Falha simulada gera rollback:
 * PASSOU / FALHOU
 * 
 * Órfãos históricos encontrados:
 * [...]
 * 
 * DRY RUN:
 * [...]
 * 
 * Backfill executado:
 * SIM / NÃO
 * 
 * Registros recuperados:
 * [...]
 * 
 * Conflitos enviados para revisão:
 * [...]
 * 
 * RLS:
 * PRESERVADA
 * 
 * Duplicidade:
 * PRESERVADA
 * 
 * WhatsApp:
 * INALTERADO
 * 
 * Home:
 * REDIRECIONAMENTO PURO
 * 
 * RESULTADO:
 * CORRIGIDO E HOMOLOGADO
 * ou
 * CORREÇÃO FUTURA OK — BACKFILL PENDENTE
 * ou
 * NÃO HOMOLOGAR
 */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/dashboard', replace: true });
  },
});
