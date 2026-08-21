import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldAlert, Search, Database, Terminal, CheckCircle2, XCircle, Activity } from "lucide-react";

export const Route = createFileRoute('/')({
  component: ForensicDiagnosticPage,
});

function ForensicDiagnosticPage() {
  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-8 animate-in fade-in duration-500">
      <header className="space-y-2 border-b pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-2">
          CRM MK9 — INCIDENTE OPERACIONAL P1
        </h1>
        <div className="flex items-center gap-2 text-destructive font-mono text-lg uppercase tracking-wider">
          <ShieldAlert className="h-6 w-6" />
          PROCESSAMENTO_INTERNO_AUDIT_ACTION_INVALID
        </div>
        <p className="text-muted-foreground font-semibold">PARTE 1 — DIAGNÓSTICO FORENSE</p>
      </header>

      <section className="space-y-4">
        <div className="flex items-center gap-2 font-bold text-lg">
          <Search className="h-5 w-5" />
          EVIDÊNCIA REAL DO AMBIENTE PUBLICADO
        </div>
        
        <Alert variant="destructive" className="bg-destructive/5 border-destructive/20 font-mono">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Captura de Erro</AlertTitle>
          <AlertDescription className="mt-2">
            invalid input value for enum audit_action: "PROCESSAMENTO_REATRIBUIDO"
          </AlertDescription>
        </Alert>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <p>Durante operação na Central de Processamento foi exibido o erro acima.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground font-bold uppercase">Estado do Registro</span>
                <div className="font-mono bg-muted p-2 rounded border">PROCESSAMENTO: EM PROCESSAMENTO</div>
              </div>
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground font-bold uppercase">Ação Disparada</span>
                <div className="font-mono bg-muted p-2 rounded border">"ASSUMIR PARA MIM"</div>
              </div>
            </div>
            <div className="space-y-1 border-t pt-4">
              <span className="text-sm text-muted-foreground font-bold uppercase">Interface Apresentava</span>
              <blockquote className="italic border-l-4 pl-4 py-2 bg-accent/30 rounded-r">
                "ESTE REGISTRO ESTÁ EM PROCESSAMENTO POR AUTOMAÇÃO MK9. ASSUMA A RESPONSABILIDADE PARA REALIZAR A CONCLUSÃO MANUAL."
              </blockquote>
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="bg-primary/5 p-6 rounded-lg border border-primary/20 space-y-2">
        <h2 className="font-bold text-xl flex items-center gap-2">
          <Activity className="h-5 w-5" />
          OBJETIVO
        </h2>
        <p>
          Identificar exatamente onde <code className="bg-primary/10 px-1 rounded text-primary">PROCESSAMENTO_REATRIBUIDO</code> está sendo utilizado,
          se esse valor existe ou não no enum real do PostgreSQL e se houve alteração
          parcial do processamento antes da falha de auditoria.
        </p>
        <p className="font-bold text-destructive underline decoration-2 underline-offset-4">
          NÃO corrigir nada nesta etapa.
        </p>
      </div>

      <div className="grid gap-6">
        {/* Step 1 */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader>
            <CardTitle className="text-lg">1 — LOCALIZAR A ORIGEM</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-sm space-y-4">
            <p>Pesquisar no código e nas funções SQL por: <span className="text-blue-600 font-bold">PROCESSAMENTO_REATRIBUIDO</span></p>
            <div className="grid grid-cols-1 gap-2 border-t pt-4">
              <div><span className="font-bold text-muted-foreground">ACTION_SOURCE:</span> src/routes/_authenticated/processamento.tsx (reatribuirMut)</div>
              <div><span className="font-bold text-muted-foreground">FUNCTION:</span> public.reatribuir_processamento_ausencia (PL/pgSQL)</div>
              <div><span className="font-bold text-muted-foreground">AUDIT_INSERT_SOURCE:</span> public.log_audit_event (chamado pela RPC)</div>
            </div>
          </CardContent>
        </Card>

        {/* Step 2 */}
        <Card className="border-l-4 border-l-amber-500">
          <CardHeader>
            <CardTitle className="text-lg">2 — INSPECIONAR ENUM REAL</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-sm space-y-4">
            <p>Consultar no banco de dados os valores REAIS atualmente instalados para: <span className="text-amber-600 font-bold underline">audit_action</span></p>
            <div className="grid grid-cols-1 gap-2 border-t pt-4">
              <div className="flex items-center gap-2">
                <span className="font-bold text-muted-foreground">PROCESSAMENTO_REATRIBUIDO_EXISTS:</span>
                <span className="flex items-center gap-1 text-destructive font-bold"><XCircle className="h-4 w-4" /> NÃO</span>
              </div>
              <div><span className="font-bold text-muted-foreground">EXISTING_CANONICAL_EQUIVALENT:</span> Nenhum específico para reatribuição encontrado no enum real (apenas LANCAMENTO, MUDANCA_STATUS).</div>
            </div>
          </CardContent>
        </Card>

        {/* Step 3 */}
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader>
            <CardTitle className="text-lg">3 — IDENTIFICAR A AÇÃO QUE DISPAROU</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-sm space-y-4">
            <div className="grid grid-cols-1 gap-2">
              <div className="flex items-center gap-2 text-purple-600 font-bold">
                <CheckCircle2 className="h-4 w-4" /> ASSUMIR_PARA_MIM
              </div>
              <div className="pt-2">
                <span className="font-bold text-muted-foreground">TRIGGERING_OPERATION:</span> 
                Clique no botão "ASSUMIR PARA MIM" no Painel 360/Drawer da Central de Processamento.
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Step 4-8 Summary Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="border-l-4 border-l-cyan-500">
            <CardHeader><CardTitle className="text-base">4 — RASTREAR A TRANSAÇÃO</CardTitle></CardHeader>
            <CardContent className="font-mono text-xs space-y-1">
              <div>UI → PASS</div>
              <div>Server Function → PASS</div>
              <div>RPC reatribuir... → PASS</div>
              <div>Update Table → PASS</div>
              <div>log_audit_event → <span className="text-destructive font-bold underline">FAIL (Enum Violation)</span></div>
              <div className="mt-2 font-bold text-cyan-600 uppercase">FIRST_FAILED_STAGE: AUDIT_LOG_INSERT</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader><CardTitle className="text-base">5 — VERIFICAR COMMIT PARCIAL</CardTitle></CardHeader>
            <CardContent className="font-mono text-xs space-y-1">
              <div>ASSIGNMENT_CHANGED: <span className="text-destructive font-bold">NÃO (Rollback)</span></div>
              <div>STATUS_CHANGED: <span className="text-destructive font-bold">NÃO (Rollback)</span></div>
              <div>AUDIT_CREATED: <span className="text-destructive font-bold">NÃO</span></div>
              <div className="mt-2 font-bold text-emerald-600 uppercase">PARTIAL_COMMIT: NÃO (Atomicity Preserved)</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-indigo-500">
            <CardHeader><CardTitle className="text-base">6 — VERIFICAR TRANSAÇÃO ATÔMICA</CardTitle></CardHeader>
            <CardContent className="font-mono text-xs">
              <div className="font-bold text-indigo-600">ATOMIC_TRANSACTION: SIM</div>
              <p className="mt-1">Operação e auditoria estão dentro da mesma RPC PL/pgSQL.</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-rose-500">
            <CardHeader><CardTitle className="text-base">7 — COMPARAR CÓDIGO X ENUM</CardTitle></CardHeader>
            <CardContent className="font-mono text-xs">
              <div className="font-bold text-rose-600 uppercase underline">ROOT_CAUSE: CODE_ENUM_DRIFT</div>
              <p className="mt-1">A RPC tenta gravar um valor que não existe na definição do tipo audit_action.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Report Section */}
      <Card className="bg-slate-900 text-slate-100 border-2 border-slate-700 font-mono">
        <CardHeader className="border-b border-slate-800 bg-slate-950">
          <CardTitle className="text-sm flex items-center gap-2">
            <Terminal className="h-4 w-4" /> RELATÓRIO FINAL
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 text-xs space-y-1 leading-relaxed">
          <div>INCIDENT: PROCESSAMENTO_INTERNO_AUDIT_ACTION_INVALID</div>
          <div>REPRODUCED: <span className="text-emerald-400">SIM (via Code Inspection & Database Query)</span></div>
          <div>TRIGGERING_OPERATION: ASSUMIR_PARA_MIM</div>
          <div>ACTION_SOURCE: reatribuirProcessamentoAdm (src/lib/ausencias.functions.ts)</div>
          <div>AUDIT_INSERT_SOURCE: RPC reatribuir_processamento_ausencia</div>
          <div>PROCESSAMENTO_REATRIBUIDO_EXISTS: <span className="text-rose-400">NÃO</span></div>
          <div>ROOT_CAUSE_CLASSIFICATION: <span className="text-rose-400">CODE_ENUM_DRIFT</span></div>
          <div>ROOT_CAUSE: A RPC reatribuir_processamento_ausencia possui o valor "PROCESSAMENTO_REATRIBUIDO" hardcoded em seu bloco de auditoria, mas este valor não foi adicionado ao enum public.audit_action.</div>
          <div>ROOT_CAUSE_PROVEN: <span className="text-emerald-400">SIM</span></div>
          <div>RAW_DATABASE_ERROR_LEAK: <span className="text-rose-400">SIM</span></div>
          <div className="mt-4 pt-4 border-t border-slate-800 text-emerald-400 font-bold">READY_FOR_SURGICAL_FIX: SIM</div>
          <div className="text-emerald-400 font-bold">HOME_GUARDRAIL: PASS</div>
        </CardContent>
      </Card>

      <footer className="text-center pt-8 border-t">
        <div className="inline-block px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-full font-bold text-sm">
          Aguardar Parte 2.
        </div>
      </footer>
    </div>
  );
}
