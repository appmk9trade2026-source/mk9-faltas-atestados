// Consolidado: o Ranking de Supervisores agora é exibido dentro do
// Dashboard Executivo (/inteligencia/dashboard#ranking-supervisores).
// Esta rota é mantida como redirect para preservar links existentes.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/inteligencia/supervisores")({
  beforeLoad: () => {
    throw redirect({
      to: "/inteligencia/dashboard",
      hash: "ranking-supervisores",
    });
  },
});
