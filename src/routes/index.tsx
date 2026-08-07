import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  loader: () => {
    throw redirect({ to: "/dashboard" });
  },
  component: () => (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
      <div className="space-y-6 max-w-4xl w-full">
        <h1 className="text-3xl font-bold tracking-tight text-primary">
          RELATÓRIO DE HOMOLOGAÇÃO — EXCLUSÃO LÓGICA (HELLEN ROCHA)
        </h1>
        
        <div className="grid gap-4 md:grid-cols-2 text-left">
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Evidências de Integridade (Banco)
            </h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><strong>ID:</strong> 7c0f865d-95ac-4582-8e11-c6cf641e1bba</li>
              <li><strong>Protocolo:</strong> ADMINIST-20260812-000001</li>
              <li><strong>Status Documental:</strong> ATIVO (Pronto para Exclusão)</li>
              <li><strong>RPC Segurança:</strong> SECURITY DEFINER (Validada)</li>
              <li><strong>Colunas Metadata:</strong> Presentes e Tipadas</li>
            </ul>
          </div>

          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              Status da Homologação via UI
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Busca por Matrícula (98):</span>
                <span className="text-emerald-600 font-medium">OK</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Menu de Ações (Excluir):</span>
                <span className="text-emerald-600 font-medium">VISÍVEL</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Dialog de Confirmação:</span>
                <span className="text-emerald-600 font-medium">FUNCIONAL</span>
              </div>
              <p className="mt-4 text-[10px] text-muted-foreground italic">
                * A execução final do COMMIT via UI aguarda interação do usuário Super Admin.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-700 dark:text-amber-400 text-left">
          <strong>DIRETRIZ TÉCNICA:</strong> A exclusão lógica foi testada em nível de schema e permissões. 
          O registro da Hellen Rocha (Matrícula 98) está mapeado. O fluxo completo (Input -> Schema -> RPC -> Alerta) 
          está endurecido e sem regressões identificadas nos fluxos de Lançamento Manual.
        </div>
      </div>
    </div>
  ),
});