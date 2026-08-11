import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  loader: () => {
    throw redirect({ to: "/dashboard" });
  },
  component: () => {
    // CRM MK9 — HOMOLOGAÇÃO REAL FINAL
    // OCORRÊNCIA DE PONTO AMBEV → FALTA → INDICADORES
    // 
    // MODO:
    // HOMOLOGAÇÃO FUNCIONAL
    // 
    // CHANGE BUDGET:
    // ZERO
    // 
    // BASELINE CONGELADO:
    // - Dashboard: HOMOLOGADO
    // - public.dashboard_metrics: HOMOLOGADA
    // - contrato JSON `ultimos`: HOMOLOGADO
    // - public.rel_absenteismo: PRESERVAR
    // - public.rel_faltas: PRESERVAR
    // - public.bi_absenteismo_diario: PRESERVAR
    // - regra AMBEV Fase 4: PRESERVAR
    // - Home: PRESERVAR
    // 
    // NÃO ALTERAR CÓDIGO OU BANCO NESTA ETAPA.
    // 
    // OBJETIVO:
    // Executar uma ocorrência AMBEV real e comprovar o fluxo completo:
    // Ocorrência → PENDENTE → análise RH/Coordenação → APROVADA → vínculo com Falta → JUSTIFICADA_OCORRENCIA_PONTO → impacto operacional zero.
    return null;
  },
});
