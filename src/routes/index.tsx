import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  loader: () => {
    throw redirect({ to: "/dashboard" });
  },
  component: () => {
    // CRM MK9 — CONGELAMENTO DE BASELINE
    // DASHBOARD + AMBEV FASE 4
    // 
    // MODO:
    // REGISTRO DE BASELINE / ZERO CHANGE
    // 
    // NÃO ALTERAR CÓDIGO.
    // NÃO ALTERAR BANCO.
    // NÃO CRIAR MIGRATION.
    // NÃO ALTERAR RPC.
    // NÃO ALTERAR RLS/RBAC.
    // NÃO ALTERAR HOME.
    // NÃO CRIAR DOCUMENTAÇÃO NA UI.
    // 
    // OBJETIVO
    // 
    // Registrar o estado técnico atual como baseline aprovado.
    // 
    // ==================================================
    // BASELINE DASHBOARD
    // ==================================================
    // 
    // public.dashboard_metrics:
    // 
    // STATUS:
    // FUNCIONAL
    // 
    // Correções consolidadas:
    // 
    // 1. contrato JSON compatível com frontend;
    // 2. alias explícitos em referências de coluna;
    // 3. GRANT EXECUTE restaurado para authenticated;
    // 4. service_role preservado conforme arquitetura;
    // 5. regra AMBEV Fase 4 preservada;
    // 6. exclusão lógica status_documental preservada;
    // 7. Dashboard sem skeleton persistente;
    // 8. KPIs, gráficos e listas carregando.
    // 
    // ==================================================
    // REGRA AMBEV
    // ==================================================
    // 
    // Falta normal:
    // CONTA.
    // 
    // Falta com:
    // 
    // status_justificativa =
    // JUSTIFICADA_OCORRENCIA_PONTO
    // 
    // Impacto operacional:
    // ZERO.
    // 
    // Registro histórico:
    // PRESERVADO.
    // 
    // Atestados:
    // PRESERVADOS.
    // 
    // EXCLUIDOS:
    // CONTINUAM FORA.
    // 
    // ==================================================
    // SEGURANÇA
    // ==================================================
    // 
    // authenticated:
    // EXECUTE preservado na RPC.
    // 
    // anon:
    // conforme baseline seguro atual.
    // 
    // RLS/RBAC:
    // INALTERADOS.
    // 
    // ==================================================
    // UI
    // ==================================================
    // 
    // Dashboard:
    // OPERACIONAL.
    // 
    // Cards:
    // CARREGANDO.
    // 
    // Gráficos:
    // CARREGANDO.
    // 
    // Listas:
    // CARREGANDO.
    // 
    // Skeleton persistente:
    // NÃO.
    // 
    // Network errors:
    // NÃO.
    // 
    // ==================================================
    // GOVERNANÇA
    // ==================================================
    // 
    // Não transformar este baseline em:
    // 
    // - aba;
    // - roadmap;
    // - homologação;
    // - card;
    // - página;
    // - documentação dentro do CRM.
    // 
    // Este texto é somente contexto técnico.
    // 
    // ==================================================
    // ENTREGA
    // ==================================================
    // 
    // BASELINE — DASHBOARD / AMBEV
    // 
    // dashboard_metrics:
    // CONGELADA
    // 
    // Contrato JSON:
    // PRESERVADO
    // 
    // Aliases SQL:
    // PRESERVADOS
    // 
    // GRANT EXECUTE:
    // PRESERVADO
    // 
    // Regra AMBEV:
    // PRESERVADA
    // 
    // Dashboard:
    // OPERACIONAL
    // 
    // RLS/RBAC:
    // INALTERADOS
    // 
    // Home:
    // INALTERADA
    // 
    // ALTERAÇÕES REALIZADAS:
    // NENHUMA
    // 
    // RESULTADO:
    // BASELINE CONGELADO
    return null;
  },
});
