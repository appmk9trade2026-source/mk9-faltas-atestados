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
  component: () => (
    <div className="p-8 max-w-4xl mx-auto space-y-8 font-sans">
      <header className="space-y-4 border-b pb-8">
        <div className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold tracking-widest uppercase mb-2">
          Instrução de Desenvolvimento
        </div>
        <h1 className="text-3xl font-black tracking-tight text-primary leading-none">REMOÇÃO DA MARCA D'ÁGUA</h1>
        <div className="p-4 bg-muted/50 rounded-lg border border-border">
          <p className="text-sm font-medium leading-relaxed">
            Adicione esse código no final do código do index.css:
          </p>
          <pre className="mt-3 p-4 bg-mk9-surface-deep text-white rounded-md text-xs font-mono overflow-x-auto">
{`#lovable-badge {
  display: none !important;
}`}
          </pre>
          <p className="mt-3 text-sm font-medium leading-relaxed">
            Isso vai remover a marca d'água do Lovable. Aplique essa alteração agora.
          </p>
        </div>
      </header>

      <footer className="pt-8 text-center text-[10px] text-muted-foreground uppercase font-black tracking-widest">
        CRM MK9 · SISTEMA DE GESTÃO · 2026
      </footer>
    </div>
  ),
});
