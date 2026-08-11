import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  loader: () => {
    throw redirect({ to: "/dashboard" });
  },
  component: () => {
    // CRM MK9 — AUDITORIA FORENSE DO DASHBOARD
    // DADOS AUSENTES, NaN, CAMPOS “NÃO INFORMADO” E MÉTRICAS INCONSISTENTES
    // 
    // MODO:
    // DIAGNÓSTICO SOMENTE
    // 
    // CHANGE BUDGET:
    // ZERO
    // 
    // NÃO ALTERAR:
    // - frontend
    // - banco
    // - migrations
    // - RPCs
    // - views
    // - RLS/RBAC
    // - Dashboard
    // - BI
    // - Relatórios
    // - Home
    // 
    // OBJETIVO
    // 
    // Auditar o Dashboard atualmente renderizado e identificar por que existem:
    // 
    // 1. Colaboradores ativos = NaN
    // 2. Taxa de adesão = --
    // 3. diversos rankings com “Não informado”
    // 4. Distribuição por categoria vazia
    // 5. Tipos de ausência vazios
    // 6. Tipos oficiais por categoria vazios
    // 7. Mapa de calor zerado
    // 8. Resumo por dimensão vazio
    // 9. possíveis divergências entre KPIs, gráficos, rankings e listas
    // 
    // IMPORTANTE:
    // 
    // O Dashboard agora CARREGA.
    // O problema não é mais “Falha ao carregar métricas”.
    // 
    // O incidente atual é:
    // 
    // DADOS PARCIAIS / CAMPOS INCORRETOS / AGREGAÇÕES INCONSISTENTES.
    // 
    // ==================================================
    // ETAPA 1 — MAPEAR TODOS OS COMPONENTES
    // ==================================================
    // 
    // Mapear cada bloco visível do Dashboard para sua fonte real.
    // 
    // Criar matriz:
    // 
    // BLOCO
    // COMPONENTE
    // CAMPO FRONTEND
    // FONTE SQL/RPC
    // CAMPO SQL
    // TIPO ESPERADO
    // TIPO RECEBIDO
    // STATUS
    // 
    // Incluir pelo menos:
    // 
    // - Backlog Administrativo
    // - Processados Hoje
    // - Tempo Médio Processamento
    // - Conversão Falta → Atestado
    // - Colaboradores ativos
    // - Ausências
    // - Pendências
    // - Tempo médio
    // - Lançamentos concluídos
    // - Taxa de adesão
    // - Evolução no período
    // - Distribuição por categoria
    // - Tipos de ausência
    // - Tipos oficiais por categoria
    // - Supervisores que exigem atenção
    // - Colaboradores com maior recorrência
    // - Empresas com mais ocorrências
    // - Projetos com mais ocorrências
    // - Mapa de calor
    // - Resumo por dimensão
    // - Supervisores destaque
    // - Empresas destaque
    // - Projetos destaque
    // - Conformidade da operação
    // - Últimas ocorrências
    // - Insights automáticos
    // 
    // ==================================================
    // ETAPA 2 — INVESTIGAR NaN
    // ==================================================
    // 
    // O card:
    // 
    // COLABORADORES ATIVOS
    // 
    // está exibindo:
    // 
    // NaN
    // 
    // Localizar exatamente:
    // 
    // - campo da RPC usado;
    // - transformação no frontend;
    // - Number(...)
    // - parseInt(...)
    // - parseFloat(...)
    // - divisão;
    // - cálculo derivado.
    // 
    // Responder:
    // 
    // valor bruto retornado:
    // [...]
    // 
    // tipo:
    // [...]
    // 
    // valor transformado:
    // [...]
    // 
    // operação que gerou NaN:
    // [...]
    // 
    // CAUSA RAIZ:
    // [...]
    // 
    // Não corrigir ainda.
    // 
    // ==================================================
    // ETAPA 3 — TAXA DE ADESÃO
    // ==================================================
    // 
    // O card:
    // 
    // TAXA DE ADESÃO
    // 
    // aparece como:
    // 
    // --
    // 
    // Descobrir:
    // 
    // - qual é a fórmula;
    // - qual é o numerador;
    // - qual é o denominador;
    // - qual campo está ausente/nulo;
    // - se a métrica é realmente calculável com os dados atuais.
    // 
    // Responder:
    // 
    // fórmula esperada:
    // [...]
    // 
    // numerador:
    // [...]
    // 
    // denominador:
    // [...]
    // 
    // resultado SQL:
    // [...]
    // 
    // resultado frontend:
    // [...]
    // 
    // Motivo do “--”:
    // [...]
    // 
    // Classificar:
    // 
    // A — denominador inexistente
    // B — campo ausente
    // C — contrato quebrado
    // D — cálculo frontend
    // E — regra ainda não implementada
    // F — outro
    // 
    // ==================================================
    // ETAPA 4 — “NÃO INFORMADO”
    // ==================================================
    // 
    // Nos rankings existem diversas linhas mostrando:
    // 
    // “NÃO INFORMADO”
    // 
    // Auditar por que Supervisor/Empresa/Projeto/Colaborador estão perdendo o nome.
    // 
    // Para cada ranking:
    // 
    // - fonte
    // - join
    // - foreign key
    // - campo textual
    // - UUID
    // - fallback
    // 
    // Verificar se o SQL está agrupando por UUID mas deixando de fazer JOIN
    // com a tabela canônica de nomes.
    // 
    // Também verificar se o frontend espera:
    // 
    // nome
    // 
    // mas a RPC retorna:
    // 
    // supervisor_nome
    // empresa_nome
    // projeto_nome
    // colaborador_nome
    // 
    // ou equivalente.
    // 
    // Não mascarar com fallback textual.
    // 
    // ==================================================
    // ETAPA 5 — DISTRIBUIÇÃO POR CATEGORIA
    // ==================================================
    // 
    // O bloco está vazio.
    // 
    // Verificar:
    // 
    // quantos registros elegíveis existem no período:
    // [...]
    // 
    // quantos possuem categoria_id:
    // [...]
    // 
    // quantos possuem categoria:
    // [...]
    // 
    // RPC retorna array:
    // SIM / NÃO
    // 
    // campo esperado pelo frontend:
    // [...]
    // 
    // campo recebido:
    // [...]
    // 
    // Se houver registros com categoria mas gráfico vazio:
    // classificar como bug.
    // 
    // Se não houver categoria cadastrada:
    // classificar como ausência legítima de dados.
    // 
    // ==================================================
    // ETAPA 6 — TIPOS DE AUSÊNCIA
    // ==================================================
    // 
    // Auditar:
    // 
    // tipo
    // categoria
    // tipo_oficial
    // tipo_ausencia
    // motivo
    // 
    // ou campos equivalentes.
    // 
    // Comparar diretamente:
    // 
    // COUNT real no banco por tipo:
    // [...]
    // 
    // JSON RPC:
    // [...]
    // 
    // Dashboard:
    // [...]
    // 
    // Se o banco possui dados e o card mostra vazio:
    // bug comprovado.
    // 
    // ==================================================
    // ETAPA 7 — TIPOS OFICIAIS POR CATEGORIA
    // ==================================================
    // 
    // Verificar se esse bloco depende de:
    // 
    // categoria_id
    // tipo_oficial_id
    // motivo_id
    // catálogo de tipos
    // 
    // Auditar JOINs.
    // 
    // Responder:
    // 
    // dados-base existem:
    // SIM / NÃO
    // 
    // JOIN retorna:
    // [...]
    // 
    // RPC retorna:
    // [...]
    // 
    // UI recebe:
    // [...]
    // 
    // ==================================================
    // ETAPA 8 — MAPA DE CALOR
    // ==================================================
    // 
    // O mapa de calor mostra todos os dias com:
    // 
    // 0
    // 
    // Mas o gráfico “Evolução no período” mostra ocorrências no mesmo intervalo.
    // 
    // Isso é potencialmente inconsistente.
    // 
    // Comparar:
    // 
    // Evolução no período:
    // fonte = [...]
    // 
    // Mapa de calor:
    // fonte = [...]
    // 
    // Intervalo:
    // [...]
    // 
    // Timezone:
    // [...]
    // 
    // Campo temporal usado na evolução:
    // [...]
    // 
    // Campo temporal usado no mapa de calor:
    // [...]
    // 
    // COUNT por dia da semana diretamente no banco:
    // Dom [...]
    // Seg [...]
    // Ter [...]
    // Qua [...]
    // Qui [...]
    // Sex [...]
    // Sáb [...]
    // 
    // Se banco > 0 e mapa = 0:
    // BUG COMPROVADO.
    // 
    // ==================================================
    // ETAPA 9 — RESUMO POR DIMENSÃO
    // ==================================================
    // 
    // O bloco:
    // 
    // Resumo por dimensão
    // 
    // está vazio.
    // 
    // Auditar abas:
    // 
    // Empresas
    // Projetos
    // Supervisores
    // 
    // Confirmar:
    // 
    // query existe:
    // SIM / NÃO
    // 
    // dados retornados:
    // [...]
    // 
    // estado frontend:
    // [...]
    // 
    // filtro atual:
    // [...]
    // 
    // Verificar se o componente está lendo campos inexistentes ou arrays com outro nome.
    // 
    // ==================================================
    // ETAPA 10 — COMPARAÇÃO DO CONTRATO COMPLETO
    // ==================================================
    // 
    // Comparar:
    // 
    // DashboardData TypeScript
    // VS
    // JSON real de public.dashboard_metrics
    // 
    // Campo por campo.
    // 
    // Criar tabela:
    // 
    // FRONTEND
    // RPC
    // TIPO FRONTEND
    // TIPO RPC
    // PRESENTE
    // COMPATÍVEL
    // 
    // Não focar apenas em `ultimos`.
    // 
    // Auditar TODAS as propriedades.
    // 
    // ==================================================
    // ETAPA 11 — CAMPOS NULOS
    // ==================================================
    // 
    // Identificar campos em que o backend retorna:
    // 
    // null
    // 
    // mas o frontend espera:
    // 
    // number
    // array
    // object
    // string
    // 
    // Listar:
    // 
    // campo:
    // [...]
    // 
    // esperado:
    // [...]
    // 
    // recebido:
    // [...]
    // 
    // impacto visual:
    // [...]
    // 
    // ==================================================
    // ETAPA 12 — FILTROS
    // ==================================================
    // 
    // O print mostra:
    // 
    // Período: Últimos 30 dias
    // Empresa: Todas
    // Projeto: Todos
    // Categoria: Todas
    // Tipo: Todos
    // Status: Todos
    // 
    // Capturar payload real enviado.
    // 
    // Confirmar como cada “Todos” é serializado:
    // 
    // null
    // undefined
    // ""
    // "todos"
    // outro
    // 
    // Verificar se algumas subqueries interpretam “Todos” incorretamente
    // e acabam zerando apenas certos blocos.
    // 
    // ==================================================
    // ETAPA 13 — MESMO PERÍODO / MESMO ESCOPO
    // ==================================================
    // 
    // Selecionar um período real com dados.
    // 
    // Comparar para o mesmo escopo:
    // 
    // Total de ausências:
    // [...]
    // 
    // Evolução no período:
    // [...]
    // 
    // Mapa de calor:
    // [...]
    // 
    // Distribuição por categoria:
    // [...]
    // 
    // Tipos:
    // [...]
    // 
    // Rankings:
    // [...]
    // 
    // Todos os blocos devem ser matematicamente explicáveis entre si.
    // 
    // ==================================================
    // ETAPA 14 — REGRA AMBEV
    // ==================================================
    // 
    // Preservar:
    // 
    // JUSTIFICADA_OCORRENCIA_PONTO = impacto operacional zero.
    // 
    // Auditar apenas se essa regra está sendo aplicada de forma excessiva em subqueries.
    // 
    // Como existem 0 justificadas AMBEV no baseline informado anteriormente,
    // ela NÃO pode explicar blocos zerados hoje.
    // 
    // Se algum bloco mudou por causa do filtro AMBEV mesmo com 0 justificadas:
    // regressão comprovada.
    // 
    // ==================================================
    // ETAPA 15 — CLASSIFICAÇÃO DAS CAUSAS
    // ==================================================
    // 
    // Para cada problema, classificar:
    // 
    // A — campo ausente na RPC
    // B — nome de campo divergente
    // C — tipo incompatível
    // D — null inesperado
    // E — JOIN faltante
    // F — alias errado
    // G — agregação incorreta
    // H — filtro aplicado incorretamente
    // I — período/timezone inconsistente
    // J — cálculo frontend incorreto
    // K — dado realmente inexistente
    // L — múltiplas causas
    // 
    // Não usar “provavelmente”.
    // 
    // ==================================================
    // ETAPA 16 — CORREÇÃO MÍNIMA PROPOSTA
    // ==================================================
    // 
    // NÃO implementar.
    // 
    // Para cada erro confirmado, entregar:
    // 
    // PROBLEMA:
    // [...]
    // 
    // CAUSA:
    // [...]
    // 
    // OBJETO:
    // [...]
    // 
    // CORREÇÃO MÍNIMA:
    // [...]
    // 
    // RPC:
    // SIM / NÃO
    // 
    // FRONTEND:
    // SIM / NÃO
    // 
    // MIGRATION:
    // SIM / NÃO
    // 
    // RISCO:
    // BAIXO / MÉDIO / ALTO
    // 
    // ==================================================
    // REGRA DE PARADA
    // ==================================================
    // 
    // NÃO fazer correções nesta rodada.
    // 
    // Mesmo que encontre um bug simples:
    // 
    // PARAR APÓS O DIAGNÓSTICO.
    // 
    // Não alterar dashboard_metrics novamente sem mapa completo das divergências.
    // 
    // ==================================================
    // ENTREGA OBRIGATÓRIA
    // ==================================================
    // 
    // DIAGNÓSTICO — DASHBOARD / DADOS INCOMPLETOS
    // 
    // Colaboradores ativos = NaN
    // Causa:
    // [...]
    // 
    // Taxa de adesão = --
    // Causa:
    // [...]
    // 
    // “NÃO INFORMADO”
    // Causa:
    // [...]
    // 
    // Distribuição por categoria:
    // DADO AUSENTE / BUG
    // 
    // Tipos de ausência:
    // DADO AUSENTE / BUG
    // 
    // Tipos oficiais:
    // DADO AUSENTE / BUG
    // 
    // Mapa de calor:
    // CONSISTENTE / DIVERGENTE
    // 
    // Resumo por dimensão:
    // CONSISTENTE / DIVERGENTE
    // 
    // Contrato DashboardData x RPC:
    // ÍNTEGRO / DIVERGENTE
    // 
    // Campos divergentes:
    // [...]
    // 
    // Nulls inesperados:
    // [...]
    // 
    // Filtros “Todos”:
    // CORRETOS / DIVERGENTES
    // 
    // Regra AMBEV:
    // PRESERVADA / REGRESSIVA
    // 
    // Problemas confirmados:
    // 1. [...]
    // 2. [...]
    // 3. [...]
    // 
    // Objetos que precisariam ser alterados:
    // [...]
    // 
    // Migration necessária:
    // SIM / NÃO
    // 
    // Frontend precisa alterar:
    // SIM / NÃO
    // 
    // ALTERAÇÕES REALIZADAS:
    // NENHUMA
    // 
    // RESULTADO:
    // DIAGNÓSTICO CONCLUÍDO — AGUARDANDO AUTORIZAÇÃO
    return null;
  },
});
