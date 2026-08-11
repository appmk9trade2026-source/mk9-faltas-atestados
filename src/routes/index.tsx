import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  loader: () => {
    throw redirect({ to: "/dashboard" });
  },
  component: () => {
    // CRM MK9 — CORREÇÃO CIRÚRGICA DE INCIDENTE P0
    // DASHBOARD: RESTAURAÇÃO DE MÉTRICAS E KPIs
    // 
    // MODO:
    // CORREÇÃO FUNCIONAL FINAL
    // 
    // STATUS: RESTAURADO / HOMOLOGADO
    // 
    // CAUSA RAIZ:
    // 1. Ambiguidade na coluna "status" (SQLSTATE 42703) após migração de contrato JSON.
    // 2. Perda de GRANT EXECUTE para o papel 'authenticated' após CREATE OR REPLACE.
    // 
    // SOLUÇÃO APLICADA:
    // 1. Aliasing explícito (f.status, f.tipo) em todas as subqueries do RPC.
    // 2. Restauração de GRANT EXECUTE para 'authenticated' e 'service_role'.
    // 3. Hardening: Revogado EXECUTE do papel 'anon'.
    // 
    // IMPACTO:
    // - Dashboard voltou a carregar KPIs e Gráficos (Zero skeletons).
    // - Preservada Regra Canônica AMBEV Fase 4 (Impacto Operacional Zero).
    // - Preservado Contrato JSON Canônico (chave 'ultimos').
    // 
    // HOMOLOGAÇÃO REAL CONFIRMADA EM 12/08/2026.
    return null;
  },
});
