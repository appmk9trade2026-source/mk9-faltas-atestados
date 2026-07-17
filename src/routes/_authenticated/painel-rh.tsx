import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const Route = createFileRoute("/_authenticated/painel-rh")({
  head: () => ({ meta: [{ title: "Painel do RH · CRM MK9" }] }),
  component: () => <PlaceholderPage title="Painel do RH" description="Fila de análise e lançamentos." />,
});
