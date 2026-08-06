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
      <header className="space-y-2 border-b pb-6">
        <h1 className="text-3xl font-black tracking-tight text-primary">CRM MK9 — FASE 5</h1>
        <h2 className="text-xl font-bold text-muted-foreground uppercase tracking-widest">PAINEL 360º DA AUSÊNCIA</h2>
        <p className="text-sm font-medium opacity-70">(Central de Processamento)</p>
        <div className="mt-4 p-2 bg-muted rounded text-[10px] font-mono">
          Project Ref: wgozydjiuimxxddhodax
        </div>
      </header>

      <section className="space-y-4">
        <h3 className="text-lg font-bold border-l-4 border-primary pl-3 uppercase">OBJETIVO</h3>
        <p className="text-sm leading-relaxed">
          Transformar o painel lateral da Central de Processamento em uma visão 360° da ausência.
        </p>
        <p className="text-sm leading-relaxed">
          O objetivo é que Charles, RH, Compliance e Super Admin consigam realizar todo o processamento sem precisar abrir outras telas (Ausências, Painel RH ou Colaboradores).
        </p>
      </section>

      <section className="space-y-4 bg-amber-50 dark:bg-amber-950/20 p-6 rounded-xl border border-amber-200 dark:border-amber-900">
        <h3 className="text-lg font-bold text-amber-800 dark:text-amber-400 uppercase">IMPORTANTE</h3>
        <p className="text-sm font-bold">NÃO alterar:</p>
        <ul className="grid grid-cols-2 gap-2 text-xs font-medium">
          <li>• SQL</li>
          <li>• RPCs</li>
          <li>• Triggers</li>
          <li>• RLS</li>
          <li>• RBAC</li>
          <li>• Workflow</li>
          <li>• Auditoria</li>
          <li>• Dashboard</li>
          <li>• BI Executivo</li>
        </ul>
        <p className="text-xs italic mt-4">
          Esta fase é exclusivamente de experiência do usuário (UI/UX), organização das informações e reaproveitamento dos dados já existentes.
        </p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4 p-5 border rounded-xl bg-card shadow-sm">
          <h4 className="font-black text-xs uppercase tracking-tighter text-muted-foreground">SEÇÃO 1: RESUMO EXECUTIVO</h4>
          <p className="text-xs text-muted-foreground">Card no topo com dados vitais, prioridade, SLA e avatar/iniciais do colaborador.</p>
        </div>
        <div className="space-y-4 p-5 border rounded-xl bg-card shadow-sm">
          <h4 className="font-black text-xs uppercase tracking-tighter text-muted-foreground">SEÇÃO 2: DADOS DO COLABORADOR</h4>
          <p className="text-xs text-muted-foreground">Identidade completa, contatos, dados do supervisor e situação contratual (LGPD compliant).</p>
        </div>
        <div className="space-y-4 p-5 border rounded-xl bg-card shadow-sm">
          <h4 className="font-black text-xs uppercase tracking-tighter text-muted-foreground">SEÇÃO 3: DETALHES DA AUSÊNCIA</h4>
          <p className="text-xs text-muted-foreground">Tipo, CID, Localidade, Motivo, Acidente de Trabalho e auditoria de lançamento.</p>
        </div>
        <div className="space-y-4 p-5 border rounded-xl bg-card shadow-sm">
          <h4 className="font-black text-xs uppercase tracking-tighter text-muted-foreground">SEÇÃO 4: DOCUMENTOS</h4>
          <p className="text-xs text-muted-foreground">Listagem de anexos com visualização e download ou estado vazio.</p>
        </div>
      </div>

      <section className="space-y-6 pt-6 border-t">
        <div className="flex items-center gap-4">
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-white font-bold">5</div>
          <h3 className="text-lg font-black uppercase">PROCESSAMENTO INTERNO</h3>
        </div>
        <div className="pl-12 space-y-4">
          <p className="text-sm">Timeline completa de eventos, checklist visual de apoio operacional e área de observações administrativas.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded text-center">
              <span className="text-[10px] block font-bold text-blue-600">AGUARDANDO</span>
              <span className="text-xs font-medium">Assumir</span>
            </div>
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded text-center">
              <span className="text-[10px] block font-bold text-emerald-600">PROCESSANDO</span>
              <span className="text-xs font-medium">Continuar/Concluir</span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900/20 border border-slate-100 dark:border-slate-800 rounded text-center">
              <span className="text-[10px] block font-bold text-slate-600">PROCESSADO</span>
              <span className="text-xs font-medium">Histórico</span>
            </div>
          </div>
        </div>
      </section>

      <footer className="pt-12 text-center text-[10px] text-muted-foreground uppercase font-black tracking-widest">
        CRM MK9 · MODERN INTERFACE · FASE 5
      </footer>
    </div>
  ),
});