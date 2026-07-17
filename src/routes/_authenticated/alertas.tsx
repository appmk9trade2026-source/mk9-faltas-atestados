import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const Route = createFileRoute("/_authenticated/alertas")({
  head: () => ({ meta: [{ title: "Alertas · CRM MK9" }] }),
  component: () => <PlaceholderPage title="Alertas" description="Alertas operacionais e de compliance." />,
});
