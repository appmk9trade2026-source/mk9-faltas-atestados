import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Usuários · CRM MK9" }] }),
  component: () => <PlaceholderPage title="Usuários" description="Gestão de usuários e papéis (Super Admin)." />,
});
