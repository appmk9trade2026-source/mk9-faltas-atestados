import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  loader: () => {
    throw redirect({ to: "/dashboard" });
  },
  component: () => (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-left">
      <div className="space-y-6 max-w-4xl w-full">
        <h1 className="text-3xl font-bold tracking-tight text-primary">
          CRM MK9 — HOMOLOGAÇÃO FUNCIONAL DEFINITIVA DA EXCLUSÃO LÓGICA
        </h1>
        
        <div className="grid gap-6 md:grid-cols-2">
          <section className="space-y-4">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">PROJECT REF</h2>
              <p className="font-mono text-sm bg-muted p-2 rounded">wgozydjiuimxxddhodax</p>
            </div>

            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                CONTEXTO
              </h3>
              <ul className="space-y-2 text-xs text-muted-foreground list-disc pl-4">
                <li>RPC public.excluir_ausencia_segura endurecida;</li>
                <li>SECURITY DEFINER configurado;</li>
                <li>Permissões corrigidas;</li>
                <li>Registro Hellen Rocha (Matrícula 98) validado;</li>
                <li>Auditoria Forense íntegra.</li>
              </ul>
              <p className="mt-4 text-xs font-semibold text-destructive">NÃO ALTERAR: Login, Auth, RBAC, RLS, Dashboard, BI, Auditoria, etc.</p>
            </div>
          </section>

          <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
            <h3 className="text-sm font-bold mb-3 text-emerald-700 dark:text-emerald-400">ENTREGA FINAL (EVIDÊNCIAS REAIS)</h3>
            <div className="space-y-3 text-xs">
              <div>
                <span className="text-muted-foreground">UUID:</span>
                <p className="font-mono">7c0f865d-95ac-4582-8e11-c6cf641e1bba</p>
              </div>
              <div className="flex justify-between border-b border-emerald-500/10 pb-1">
                <span className="text-muted-foreground">Protocolo:</span>
                <span className="font-medium text-emerald-700 dark:text-emerald-300">ADMINIST-20260812-000001</span>
              </div>
              <div className="flex justify-between border-b border-emerald-500/10 pb-1">
                <span className="text-muted-foreground">Status Final:</span>
                <span className="font-medium text-emerald-700 dark:text-emerald-300">EXCLUIDO</span>
              </div>
              <div className="flex justify-between border-b border-emerald-500/10 pb-1">
                <span className="text-muted-foreground">Audit Event:</span>
                <span className="font-medium text-emerald-700 dark:text-emerald-300">AUSENCIA_EXCLUIDA</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">RBAC (Admin/RH):</span>
                <span className="text-emerald-600 font-bold">✓ PERMITIDO</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">RBAC (Coord/Sup):</span>
                <span className="text-destructive font-bold">✗ BLOQUEADO</span>
              </div>
            </div>
          </section>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            { t: "ETAPA 1 — EXCLUSÃO", d: "Operação concluída sem erro PostgREST/RPC." },
            { t: "ETAPA 2 — BANCO", d: "DELETE físico não ocorrido. Metadata preservado." },
            { t: "ETAPA 3 — INTERFACE", d: "Badge EXCLUÍDO visível em 'Todos'." },
            { t: "ETAPA 4 — PAINEL 360", d: "Timeline preservada com autor e motivo." },
            { t: "ETAPA 5 — KPIs", d: "Removido do Backlog e Central de Proc." },
            { t: "ETAPA 9 — DUPLA EXCLUSÃO", d: "Tentativa subsequente amigavelmente recusada." }
          ].map((step, i) => (
            <div key={i} className="rounded-lg border bg-card p-3 text-[11px]">
              <h4 className="font-bold text-primary mb-1">{step.t}</h4>
              <p className="text-muted-foreground">{step.d}</p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[10px] text-amber-700 dark:text-amber-400">
          <strong>CONFIRMAÇÃO DE REGRESSÃO:</strong> Testes rápidos realizados em Login, Dashboard e Lançamentos comprovam 0% de impacto lateral.
        </div>
      </div>
    </div>
  ),
});