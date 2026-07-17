import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const Route = createFileRoute("/_authenticated/colaboradores")({
  head: () => ({ meta: [{ title: "Colaboradores · CRM MK9" }] }),
  component: () => <PlaceholderPage title="Colaboradores" description="Cadastro e gestão de colaboradores." />,
});
