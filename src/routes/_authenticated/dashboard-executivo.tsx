import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard-executivo")({
  component: RedirectToInteligencia,
});

function RedirectToInteligencia() {
  return <Navigate to="/inteligencia" search={{ tab: "dashboard" }} replace />;
}
