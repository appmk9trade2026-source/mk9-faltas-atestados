import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({ meta: [{ title: "Histórico · CRM MK9" }] }),
  component: () => <PlaceholderPage title="Histórico" description="Consulta de ausências registradas." />,
});
