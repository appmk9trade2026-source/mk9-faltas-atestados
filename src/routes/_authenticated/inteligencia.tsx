// Consolidado: a "Inteligência Analítica" agora vive em /inteligencia/dashboard.
// Esta rota é mantida apenas como redirecionamento para preservar links
// existentes (menu, deep-links, botões "Voltar ao ranking") sem quebrar
// tipagem do TanStack Router. Nenhuma RPC/cálculo/RLS foi alterado.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/inteligencia")({
  beforeLoad: () => {
    throw redirect({ to: "/inteligencia/dashboard" });
  },
});
