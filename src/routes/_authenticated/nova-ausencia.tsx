import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const Route = createFileRoute("/_authenticated/nova-ausencia")({
  head: () => ({ meta: [{ title: "Nova Ausência · CRM MK9" }] }),
  component: () => <PlaceholderPage title="Nova Ausência" description="Registro de faltas e atestados." />,
});
