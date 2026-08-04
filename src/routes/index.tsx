import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "CRM MK9 · Faltas e Atestados" },
      {
        name: "description",
        content: "CRM MK9 para gestão de faltas, atestados, colaboradores, projetos e indicadores operacionais.",
      },
      { property: "og:title", content: "CRM MK9 · Faltas e Atestados" },
      {
        property: "og:description",
        content: "CRM MK9 para gestão de faltas, atestados, colaboradores, projetos e indicadores operacionais.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  component: () => null,
});