import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios · CRM MK9" }] }),
  component: () => <PlaceholderPage title="Relatórios" description="Relatórios gerenciais." />,
});
