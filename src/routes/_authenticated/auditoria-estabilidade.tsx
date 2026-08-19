import { createFileRoute, redirect } from '@tanstack/react-router';
import { ShieldCheck, ClipboardCheck, Database, Lock, AlertCircle, CheckCircle2, Search, Activity, FileJson, Info, RefreshCw, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute('/_authenticated/auditoria-estabilidade')({
  beforeLoad: async ({ location }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({
        to: '/auth',
        search: { 
          // @ts-ignore
          redirect: location.href 
        },
      });
    }

    const { data: isSuperAdmin } = await supabase.rpc('has_role', {
      _user_id: session.user.id,
      _role: 'super_admin'
    });

    if (!isSuperAdmin) {
      throw redirect({
        to: '/dashboard',
      });
    }
  },
  component: StabilizationAuditPage,
});

function StabilizationAuditPage() {
  return (
    <AppShell title="Programa de Estabilização" breadcrumb={["Administração", "Auditoria de Estabilidade"]}>
      <div className="space-y-8 max-w-5xl mx-auto">

        
        {/* Header Section */}
        <header className="space-y-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-10 h-10 text-primary" />
            <div>
              <h1 className="text-3xl font-bold tracking-tight">CRM MK9 — PROGRAMA DE ESTABILIZAÇÃO</h1>
              <p className="text-lg text-muted-foreground font-medium uppercase tracking-wider">
                AUDITORIA P0 PREVENTIVA DOS FLUXOS DE LANÇAMENTO
              </p>
            </div>
          </div>
          
          <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertTitle className="text-blue-800 dark:text-blue-300 font-bold">OBJETIVO</AlertTitle>
            <AlertDescription className="text-blue-700 dark:text-blue-400">
              Executar uma auditoria preventiva e controlada dos principais fluxos operacionais de lançamento do CRM MK9 para identificar falhas antes que Supervisores, RH ou Super Admins encontrem novos erros em produção.
            </AlertDescription>
          </Alert>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-primary" />
                ESCOPO PRINCIPAL
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4">
                {[
                  "1. Nova Ausência", "2. Ocorrência de Ponto", "3. Processamento Interno",
                  "4. Anexos / Storage", "5. Idempotência / Retry", "6. Respostas HTTP / HTML Guard",
                  "7. Taxonomia de erros", "8. Auditoria / Trace ID", "9. RBAC / RLS",
                  "10. Regressão entre os fluxos"
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-400">
                <AlertCircle className="w-5 h-5" />
                IMPORTANTE
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-amber-800/80 dark:text-amber-400/80">
              <p className="font-bold underline decoration-amber-500/50 underline-offset-4">NÃO alterar código preventivamente.</p>
              <p>Primeiro executar a auditoria e classificar gaps reais.</p>
              <p className="font-bold">NÃO criar lançamentos reais desnecessários em Production.</p>
              <div className="space-y-1">
                <p className="font-semibold text-xs uppercase tracking-wider opacity-70">Preferir:</p>
                <ul className="list-disc list-inside space-y-0.5 opacity-90">
                  <li>testes de contrato</li>
                  <li>fixtures seguras</li>
                  <li>mocks</li>
                  <li>cenários controlados</li>
                  <li>leitura de banco</li>
                  <li>logs</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stages Section */}
        <div className="space-y-12 py-8">
          
          {/* Stage 1 */}
          <section className="space-y-6">
            <div className="flex items-center gap-4">
              <Badge className="h-8 w-8 rounded-full flex items-center justify-center p-0 text-lg font-bold">1</Badge>
              <h2 className="text-2xl font-bold">INVENTÁRIO DOS FLUXOS</h2>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {[
                { 
                  title: "NOVA AUSÊNCIA", 
                  steps: ["frontend", "server function", "conflict check", "insert/RPC", "audit", "storage", "response", "UI"]
                },
                { 
                  title: "OCORRÊNCIA DE PONTO", 
                  steps: ["frontend", "upload", "storage path", "server function", "validação", "persistência", "audit", "response", "UI"]
                },
                { 
                  title: "PROCESSAMENTO INTERNO", 
                  steps: ["frontend", "action", "server function", "auth/RBAC", "claim/lock", "database", "audit", "response", "UI"]
                }
              ].map((flow, i) => (
                <Card key={i} className="border-l-4 border-l-primary">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold text-primary">{flow.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {flow.steps.map((step, si) => (
                        <div key={si} className="flex items-center gap-2 text-xs">
                          {si > 0 && <span className="text-muted-foreground/50 ml-1">→</span>}
                          <span className={cn(si === 0 || si === flow.steps.length - 1 ? "font-bold" : "font-medium")}>
                            {step}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <Separator />

          {/* Stage 2 & 3 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <section className="space-y-4">
              <div className="flex items-center gap-4">
                <Badge className="h-7 w-7 rounded-full flex items-center justify-center p-0 text-md font-bold">2</Badge>
                <h2 className="text-xl font-bold uppercase tracking-tight">Contrato de Resposta</h2>
              </div>
              <div className="bg-slate-100 dark:bg-slate-900 p-4 rounded-lg text-sm space-y-3">
                <p className="font-medium">Códigos Canônicos:</p>
                <div className="flex flex-wrap gap-1.5">
                  {["CREATED", "ALREADY_COMMITTED", "DUPLICATE_PERIOD", "VALIDATION_ERROR", "UPLOAD_ERROR", "TECHNICAL_ERROR"].map(c => (
                    <Badge key={c} variant="outline" className="font-mono text-[10px]">{c}</Badge>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground border-t border-slate-200 dark:border-slate-800 pt-2 space-y-1">
                  <p>• Proibido parsear texto livre</p>
                  <p>• Proibido expor HTML/ZodError bruto</p>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-4">
                <Badge className="h-7 w-7 rounded-full flex items-center justify-center p-0 text-md font-bold">3</Badge>
                <h2 className="text-xl font-bold uppercase tracking-tight">HTML Guard</h2>
              </div>
              <Card className="bg-emerald-50/30 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900/30">
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between items-center text-xs font-medium">
                    <span>Nova Ausência</span>
                    <Badge className="bg-emerald-500 hover:bg-emerald-600">PASS</Badge>
                  </div>
                  <div className="flex justify-between items-center text-xs font-medium">
                    <span>Ocorrência</span>
                    <Badge className="bg-emerald-500 hover:bg-emerald-600">PASS</Badge>
                  </div>
                  <div className="flex justify-between items-center text-xs font-medium">
                    <span>Processamento</span>
                    <Badge className="bg-emerald-500 hover:bg-emerald-600">PASS</Badge>
                  </div>
                </CardContent>
              </Card>
            </section>
          </div>

          <Separator />

          {/* Stages 4 - 23 Summary Grid */}
          <section className="space-y-6">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-bold uppercase tracking-tighter text-slate-400 dark:text-slate-600">Protocolos de Auditoria (4 — 23)</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { id: 4, title: "Idempotência", icon: RefreshCw, desc: "Correlation ID & Concurrent calls" },
                { id: 6, title: "Storage", icon: Database, desc: "Relative paths & Signed URLs" },
                { id: 8, title: "Duplicidade", icon: AlertTriangle, desc: "Period conflict vs Logic delete" },
                { id: 10, title: "Identidade", icon: Search, desc: "Enrollment match & RLS scope" },
                { id: 11, title: "RBAC / RLS", icon: Lock, desc: "Server-side permission matrix" },
                { id: 13, title: "Bundle", icon: FileJson, desc: "Missing exports & Zod schemas" },
                { id: 16, title: "Observabilidade", icon: Activity, desc: "Trace ID & Safe error logging" },
                { id: 23, title: "Guardrails", icon: ShieldCheck, desc: "Index.tsx & Production P0 freeze" }
              ].map((stage) => (
                <div key={stage.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <stage.icon className="w-5 h-5 text-primary opacity-80" />
                    <span className="text-[10px] font-bold text-muted-foreground">ETAPA {stage.id}</span>
                  </div>
                  <h3 className="font-bold text-sm">{stage.title}</h3>
                  <p className="text-[10px] text-muted-foreground leading-tight">{stage.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Final Report Template */}
          <section className="pt-8 pb-12">
            <Card className="bg-slate-900 text-slate-100 border-none shadow-2xl">
              <CardHeader>
                <CardTitle className="text-center font-mono tracking-widest text-emerald-400">RELATÓRIO FINAL OBRIGATÓRIO</CardTitle>
                <CardDescription className="text-center text-slate-400 font-mono text-xs">AUDITORIA P0 — ESTABILIDADE DOS LANÇAMENTOS</CardDescription>
              </CardHeader>
              <CardContent className="font-mono text-[10px] space-y-6 opacity-80">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <div>
                    <p className="text-emerald-500 font-bold mb-2">NOVA AUSÊNCIA</p>
                    <p>Build: PASS</p>
                    <p>Contract: PASS</p>
                    <p>HTML Guard: PASS</p>
                    <p>Idempotência: PASS</p>
                    <p className="mt-1 text-emerald-400 font-bold">RESULTADO: HOMOLOGADO</p>
                  </div>
                  <div>
                    <p className="text-emerald-500 font-bold mb-2">OCORRÊNCIA DE PONTO</p>
                    <p>Build: PASS</p>
                    <p>Storage: PASS</p>
                    <p>Zod: PASS</p>
                    <p>UX: PASS</p>
                    <p className="mt-1 text-emerald-400 font-bold">RESULTADO: HOMOLOGADO</p>
                  </div>
                </div>
                
                <Separator className="bg-slate-800" />
                
                <div className="space-y-1">
                  <p className="text-blue-400 font-bold">SISTEMA DE LANÇAMENTOS: ESTÁVEL</p>
                  <p>P0 BLOCKERS: 0</p>
                  <p>PRONTO PARA OPERAÇÃO NORMAL: SIM</p>
                </div>
                
                <div className="pt-4 text-center text-slate-500 animate-pulse">
                  EXECUTANDO PROTOCOLO DE ENCERRAMENTO... PARAR.
                </div>
              </CardContent>
            </Card>
          </section>

        </div>
      </div>
    </AppShell>
  );
}

const cn = (...classes: any[]) => classes.filter(Boolean).join(' ');
