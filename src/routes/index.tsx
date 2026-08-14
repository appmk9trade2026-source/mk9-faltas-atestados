import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * CRM MK9 — NOVO MÓDULO
 * GESTÃO → QUALIDADE DE LANÇAMENTOS
 * 
 * OBJETIVO
 * 
 * Criar uma nova página gerencial isolada para acompanhar a qualidade dos lançamentos de ausências realizados pelos Supervisores.
 * 
 * NOME DA PÁGINA:
 * 
 * Qualidade de Lançamentos
 * 
 * ROTA SUGERIDA:
 * 
 * /qualidade-lancamentos
 * 
 * MENU:
 * 
 * Gestão
 * → Qualidade de Lançamentos
 * 
 * IMPORTANTE:
 * 
 * Esta primeira fase é SOMENTE ANALYTICS / LEITURA.
 * 
 * NÃO alterar o fluxo atual de:
 * 
 * - Nova Ausência;
 * - exclusão de ausência;
 * - retificação;
 * - Central de Processamento;
 * - Dashboard;
 * - Relatórios;
 * - OCP AMBEV;
 * - Plano de Ação;
 * - WhatsApp.
 * 
 * ==================================================
 * ETAPA 0 — PREFLIGHT OBRIGATÓRIO
 * ==================================================
 * 
 * Antes de implementar:
 * 
 * 1. Auditar como identificar quem criou originalmente cada ausência.
 * 2. Auditar como exclusões/cancelamentos atuais são registrados.
 * 3. Identificar dados disponíveis em audit_logs e tabelas relacionadas.
 * 4. Determinar quais métricas podem ser calculadas SEM alterar dados existentes.
 * 
 * Entregar antes da implementação:
 * 
 * Fonte dos lançamentos:
 * [...]
 * 
 * Fonte das exclusões/correções:
 * [...]
 * 
 * Campo do Supervisor responsável:
 * [...]
 * 
 * Estrutura de auditoria existente:
 * [...]
 * 
 * Objetos críticos que NÃO serão alterados:
 * [...]
 * 
 * ==================================================
 * ETAPA 1 — NOVA ROTA ISOLADA
 * ==================================================
 * 
 * Criar nova página:
 * 
 * /qualidade-lancamentos
 * 
 * Adicionar no menu:
 * 
 * Gestão
 * → Qualidade de Lançamentos
 * 
 * A página deve respeitar RBAC existente.
 * 
 * Perfis sugeridos conforme permissões atuais:
 * 
 * Super Admin:
 * escopo administrativo vigente
 * 
 * RH:
 * escopo autorizado
 * 
 * Coordenador:
 * somente sua coordenação/projetos
 * 
 * Supervisor:
 * não liberar acesso automaticamente nesta fase sem permissão explícita
 * 
 * NÃO hardcodar autorização no frontend.
 * 
 * ==================================================
 * ETAPA 2 — FONTE ANALÍTICA ISOLADA
 * ==================================================
 * 
 * Criar uma fonte específica somente de leitura.
 * 
 * Preferência:
 * 
 * nova RPC ou Server Function exclusiva para:
 * 
 * qualidade_lancamentos_supervisor
 * 
 * ou nome equivalente coerente com o projeto.
 * 
 * NÃO alterar:
 * 
 * public.dashboard_metrics
 * public.rel_faltas
 * public.rel_atestados
 * public.get_colaboradores_ativos
 * public.registrar_ausencia_com_colaborador_manual
 * public.criar_ocorrencia_ponto_ambev
 * 
 * Não criar overloads em RPCs existentes.
 * 
 * ==================================================
 * ETAPA 3 — REGRA DE RESPONSABILIDADE
 * ==================================================
 * 
 * O KPI deve considerar o responsável ORIGINAL pelo lançamento.
 * 
 * Não atribuir erro ao Coordenador que excluiu/corrigiu.
 * 
 * Para cada ausência, identificar:
 * 
 * - ausencia_id
 * - protocolo
 * - created_by
 * - Supervisor responsável original
 * - projeto_id
 * - empresa_id
 * - data do lançamento
 * 
 * Se houver snapshot histórico, preservar para auditoria.
 * 
 * Nome é apresentação.
 * 
 * ID canônico é identidade.
 * 
 * ==================================================
 * ETAPA 4 — PRIMEIROS KPIs
 * ==================================================
 * 
 * Nesta primeira fase, exibir:
 * 
 * 1. TOTAL DE LANÇAMENTOS
 * 2. EXCLUSÕES / CORREÇÕES
 * 3. TAXA DE ACERTO
 * 4. TAXA DE CORREÇÃO
 * 
 * IMPORTANTE:
 * 
 * Como os motivos ainda não estão estruturados obrigatoriamente,
 * NÃO tratar toda exclusão como erro confirmado.
 * 
 * Usar nomenclatura segura:
 * 
 * EXCLUSÕES/CORREÇÕES
 * 
 * e não:
 * 
 * ERROS
 * 
 * quando não houver classificação comprovada.
 * 
 * Fórmulas:
 * 
 * taxa_correcao =
 * correcoes / total_lancamentos * 100
 * 
 * taxa_acerto =
 * (total_lancamentos - correcoes) / total_lancamentos * 100
 * 
 * Evitar divisão por zero.
 * 
 * ==================================================
 * ETAPA 5 — KPIs VISUAIS
 * ==================================================
 * 
 * Topo da página:
 * 
 * TOTAL DE LANÇAMENTOS
 * [...]
 * 
 * CORREÇÕES / EXCLUSÕES
 * [...]
 * 
 * TAXA DE ACERTO
 * [...]%
 * 
 * TAXA DE CORREÇÃO
 * [...]%
 * 
 * Adicionar comparação com período anterior quando os dados permitirem.
 * 
 * Exemplo:
 * 
 * Taxa de acerto
 * 96,2%
 * ↑ 1,4 p.p. vs período anterior
 * 
 * Não inventar tendência sem base.
 * 
 * ==================================================
 * ETAPA 6 — FILTROS
 * ==================================================
 * 
 * Adicionar filtros:
 * 
 * Período
 * Empresa
 * Projeto
 * Coordenação
 * Supervisor
 * 
 * Os filtros devem respeitar escopo server-side.
 * 
 * Coordenador nunca pode usar filtro para acessar projeto fora de sua coordenação.
 * 
 * Não confiar em IDs enviados pelo browser como prova de autorização.
 * 
 * ==================================================
 * ETAPA 7 — RANKING DE SUPERVISORES
 * ==================================================
 * 
 * Criar tabela:
 * 
 * SUPERVISOR
 * LANÇAMENTOS
 * CORREÇÕES
 * TAXA DE CORREÇÃO
 * TAXA DE ACERTO
 * 
 * Exemplo:
 * 
 * SUPERVISOR              LANÇAMENTOS  CORREÇÕES  ERRO%  ACERTO%
 * Carlos Silva            320          7          2,2%   97,8%
 * João Souza              140          11         7,9%   92,1%
 * 
 * Ordenação padrão:
 * 
 * maior taxa de correção primeiro.
 * 
 * Isso destaca onde a gestão precisa atuar.
 * 
 * ==================================================
 * ETAPA 8 — NÃO COMPARAR SÓ VOLUME
 * ==================================================
 * 
 * Nunca usar somente:
 * 
 * “Supervisor A tem 10 erros”
 * versus
 * “Supervisor B tem 3”.
 * 
 * Sempre mostrar denominador.
 * 
 * Exemplo:
 * 
 * A:
 * 500 lançamentos
 * 10 correções
 * 2%
 * 
 * B:
 * 30 lançamentos
 * 3 correções
 * 10%
 * 
 * A qualidade relativa de B é pior.
 * 
 * ==================================================
 * ETAPA 9 — DETALHE DO SUPERVISOR
 * ==================================================
 * 
 * Ao clicar em um Supervisor, abrir Drawer/modal gerencial.
 * 
 * Exibir:
 * 
 * Total de lançamentos
 * Correções/exclusões
 * Taxa de acerto
 * Taxa de correção
 * 
 * Também listar os registros relacionados:
 * 
 * Protocolo
 * Data
 * Projeto
 * Tipo da ausência
 * Situação da correção/exclusão
 * 
 * Não incluir dados médicos.
 * 
 * ==================================================
 * ETAPA 10 — GRÁFICO DE EVOLUÇÃO
 * ==================================================
 * 
 * Adicionar gráfico simples:
 * 
 * Taxa de correção ao longo do tempo.
 * 
 * Preferir:
 * 
 * linha semanal
 * ou
 * mensal
 * 
 * conforme período selecionado.
 * 
 * Não implementar múltiplos gráficos nesta primeira fase.
 * 
 * ==================================================
 * ETAPA 11 — QUALIDADE POR PROJETO
 * ==================================================
 * 
 * Adicionar visão secundária:
 * 
 * Qualidade por Projeto
 * 
 * Tabela:
 * 
 * PROJETO
 * LANÇAMENTOS
 * CORREÇÕES
 * TAXA DE ACERTO
 * 
 * Isso ajuda a diferenciar:
 * 
 * problema individual
 * 
 * de
 * 
 * problema sistêmico do projeto.
 * 
 * ==================================================
 * ETAPA 12 — DADOS NÃO CLASSIFICADOS
 * ==================================================
 * 
 * Como exclusões históricas podem não possuir motivo estruturado:
 * 
 * mostrar claramente:
 * 
 * “Correções/Exclusões não classificadas”
 * 
 * Não inferir automaticamente:
 * 
 * duplicidade
 * data incorreta
 * erro do Supervisor
 * 
 * somente pela existência de exclusão.
 * 
 * Essa classificação virá em fase posterior.
 * 
 * ==================================================
 * ETAPA 13 — PERFORMANCE
 * ==================================================
 * 
 * Evitar N+1 queries.
 * 
 * A fonte analítica deve retornar agregados server-side.
 * 
 * Não carregar todas as ausências completas para calcular KPIs no frontend.
 * 
 * Filtros por:
 * 
 * período
 * empresa
 * projeto
 * coordenação
 * supervisor
 * 
 * devem ser aplicados na fonte de dados.
 * 
 * ==================================================
 * ETAPA 14 — SEGURANÇA
 * ==================================================
 * 
 * Preservar:
 * 
 * RLS
 * RBAC
 * empresa
 * projeto
 * coordenação
 * 
 * Preferir SECURITY INVOKER.
 * 
 * Se SECURITY DEFINER for necessário:
 * 
 * SET search_path = public
 * 
 * validar:
 * auth.uid()
 * role
 * escopo
 * 
 * e restringir EXECUTE.
 * 
 * NÃO conceder:
 * 
 * anon
 * PUBLIC
 * 
 * sem necessidade comprovada.
 * 
 * ==================================================
 * ETAPA 15 — UX / DESIGN
 * ==================================================
 * 
 * Criar página gerencial moderna.
 * 
 * Estrutura sugerida:
 * 
 * [ Título + filtros ]
 * 
 * [ KPI ] [ KPI ] [ KPI ] [ KPI ]
 * 
 * [ Evolução da Taxa de Correção ]
 * 
 * [ Ranking de Supervisores ]
 * 
 * [ Qualidade por Projeto ]
 * 
 * A UI e identidade visual devem ser:
 * 
 * - bonitas;
 * - harmônicas;
 * - intuitivas;
 * - modernas;
 * - profissionais;
 * - responsivas;
 * - consistentes com o CRM MK9;
 * - baseadas nas melhores práticas contemporâneas e referências premiadas de UX e design.
 * 
 * Não usar cores punitivas excessivas.
 * 
 * Vermelho:
 * atenção real
 * 
 * Verde:
 * boa qualidade
 * 
 * Âmbar:
 * atenção
 * 
 * Não depender apenas de cor.
 * 
 * ==================================================
 * ETAPA 16 — BASELINE ANTES DA IMPLEMENTAÇÃO
 * ==================================================
 * 
 * ANTES de alterar:
 * 
 * Dashboard:
 * PASSOU
 * 
 * Nova Ausência:
 * PASSOU
 * 
 * Atestados:
 * PASSOU
 * 
 * Central:
 * PASSOU
 * 
 * OCP AMBEV:
 * PASSOU
 * 
 * Relatórios:
 * PASSOU
 * 
 * Plano de Ação:
 * PASSOU
 * 
 * Permissões:
 * PASSOU
 * 
 * WhatsApp:
 * PASSOU / INALTERADO
 * 
 * Build:
 * PASSOU
 * 
 * Registrar baseline.
 * 
 * ==================================================
 * ETAPA 17 — NÃO REGRESSÃO DEPOIS
 * ==================================================
 * 
 * Após a implementação:
 * 
 * Dashboard:
 * PASSOU
 * 
 * Nova Ausência:
 * PASSOU
 * 
 * Atestados:
 * PASSOU
 * 
 * Central:
 * PASSOU
 * 
 * OCP AMBEV:
 * PASSOU
 * 
 * Relatórios:
 * PASSOU
 * 
 * Plano de Ação:
 * PASSOU
 * 
 * Permissões:
 * PASSOU
 * 
 * WhatsApp:
 * INALTERADO
 * 
 * Build:
 * PASSOU
 * 
 * Qualquer:
 * 
 * PASSOU → FALHOU
 * 
 * é regressão.
 * 
 * NÃO HOMOLOGAR.
 * 
 * ==================================================
 * ETAPA 18 — TESTES DOS KPIs
 * ==================================================
 * 
 * Selecionar um Supervisor real.
 * 
 * Calcular manualmente na fonte:
 * 
 * Total de lançamentos:
 * [...]
 * 
 * Correções/exclusões:
 * [...]
 * 
 * Taxa de correção:
 * [...]
 * 
 * Taxa de acerto:
 * [...]
 * 
 * Comparar com UI.
 * 
 * Diferença esperada:
 * 0.
 * 
 * ==================================================
 * GUARDRAILS
 * ==================================================
 * 
 * NÃO alterar o Dashboard principal.
 * 
 * NÃO alterar public.dashboard_metrics.
 * 
 * NÃO alterar Nova Ausência.
 * 
 * NÃO alterar fluxo de exclusão atual.
 * 
 * NÃO alterar Atestados.
 * 
 * NÃO alterar Storage.
 * 
 * NÃO alterar Central de Processamento.
 * 
 * NÃO alterar Relatórios.
 * 
 * NÃO alterar OCP AMBEV.
 * 
 * NÃO alterar Plano de Ação.
 * 
 * NÃO alterar WhatsApp.
 * 
 * NÃO alterar instância WhatsApp canônica.
 * 
 * NÃO alterar RLS/RBAC global.
 * 
 * NÃO alterar src/routes/index.tsx.
 * 
 * Home permanece REDIRECIONAMENTO PURO.
 * 
 * NÃO inserir documentação técnica na Home.
 * 
 * ==================================================
 * ENTREGA FINAL
 * ==================================================
 * 
 * ENTREGA — QUALIDADE DE LANÇAMENTOS / FASE 1
 * 
 * Rota:
 * /qualidade-lancamentos
 * 
 * Menu:
 * Gestão → Qualidade de Lançamentos
 * 
 * Fonte analítica:
 * [...]
 * 
 * RPC/Server Function nova:
 * [...]
 * 
 * RPCs críticas alteradas:
 * NENHUMA / [...]
 * 
 * Total de Lançamentos:
 * PASSOU / FALHOU
 * 
 * Correções/Exclusões:
 * PASSOU / FALHOU
 * 
 * Taxa de Correção:
 * PASSOU / FALHOU
 * 
 * Taxa de Acerto:
 * PASSOU / FALHOU
 * 
 * Filtros:
 * PASSOU / FALHOU
 * 
 * Ranking:
 * PASSOU / FALHOU
 * 
 * Detalhe do Supervisor:
 * PASSOU / FALHOU
 * 
 * Qualidade por Projeto:
 * PASSOU / FALHOU
 * 
 * RLS:
 * PRESERVADA
 * 
 * RBAC:
 * PRESERVADO
 * 
 * Dashboard:
 * INALTERADO
 * 
 * Nova Ausência:
 * INALTERADA
 * 
 * Central:
 * INALTERADA
 * 
 * OCP AMBEV:
 * INALTERADO
 * 
 * Relatórios:
 * INALTERADOS
 * 
 * Plano de Ação:
 * INALTERADO
 * 
 * WhatsApp:
 * INALTERADO
 * 
 * Home:
 * REDIRECIONAMENTO PURO
 * 
 * Build:
 * PASSOU / FALHOU
 * 
 * REGRESSÕES:
 * NENHUMA / [...]
 * 
 * RESULTADO:
 * HOMOLOGADO SEM REGRESSÕES
 * ou
 * NÃO HOMOLOGADO
 */

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/dashboard', replace: true });
  },
});

