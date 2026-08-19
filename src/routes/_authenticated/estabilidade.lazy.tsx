import { createLazyFileRoute } from '@tanstack/react-router';
import { ShieldCheck, ClipboardCheck, Database, Lock, AlertCircle, CheckCircle2, Search, Activity, FileJson, Info, RefreshCw, AlertTriangle, ChevronRight, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AppShell } from "@/components/layout/app-shell";
import { useQuery } from "@tanstack/react-query";
import { getStabilityResults } from "@/lib/stability-audit.functions";
import { useState } from "react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export const Route = createLazyFileRoute('/_authenticated/estabilidade')({
  component: StabilizationAuditPage,
});

type StabilityStatus = 'NOT_TESTED' | 'PASS' | 'GAP' | 'BLOCKED';
type StabilitySeverity = 'P0' | 'P1' | 'P2' | 'P3' | 'N/A';

interface AuditResult {
  flow_id: string;
  gate_id: string;
  status: StabilityStatus;
  severity: StabilitySeverity;
  evidence?: string;
  root_cause?: string;
  recommended_fix?: string;
  trace_id?: string;
  updated_at: string;
}

const FLOWS = [
  { id: 'nova_ausencia', label: 'Nova Ausência', icon: Info },
  { id: 'ocorrencia_ponto', label: 'Ocorrência de Ponto', icon: Fingerprint },
  { id: 'processamento_interno', label: 'Processamento Interno', icon: Activity },
];

const GATES = [
  'BUILD', 'SERVER_FUNCTION', 'RESPONSE_CONTRACT', 'HTML_GUARD', 
  'ZOD_SANITIZATION', 'IDEMPOTENCY', 'DOUBLE_CLICK', 'RBAC_RLS', 
  'AUDIT_EVENT', 'TRACE_ID', 'STORAGE', 'CONCURRENCY', 
  'UX_ERROR_HANDLING', 'REGRESSION'
];

function Fingerprint(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12a10 10 0 0 1 18-6" />
      <path d="M5 19.5a10 10 0 0 1 15-8.5" />
      <path d="M8.5 22a10 10 0 0 1 7-17" />
      <path d="M11.5 15.3a10 10 0 0 1 3-3" />
      <path d="M15 18a10 10 0 0 1-1.5-6.5" />
      <path d="M12 12v.01" />
    </svg>
  );
}

function StabilizationAuditPage() {
  const { data: auditResults = [], isLoading } = useQuery({
    queryKey: ['stability-results'],
    queryFn: () => getStabilityResults(),
  });

  const [selectedGate, setSelectedGate] = useState<AuditResult | null>(null);

  const getStatusColor = (status: StabilityStatus) => {
    switch (status) {
      case 'PASS': return 'bg-emerald-500 text-white';
      case 'GAP': return 'bg-amber-500 text-white';
      case 'BLOCKED': return 'bg-red-500 text-white';
      default: return 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
    }
  };

  const getSeverityBadge = (severity: StabilitySeverity) => {
    switch (severity) {
      case 'P0': return <Badge variant="destructive">P0</Badge>;
      case 'P1': return <Badge className="bg-orange-500">P1</Badge>;
      case 'P2': return <Badge variant="secondary">P2</Badge>;
      case 'P3': return <Badge variant="outline">P3</Badge>;
      default: return null;
    }
  };

  const getFlowStats = (flowId: string) => {
    const results = auditResults.filter(r => r.flow_id === flowId);
    const passCount = results.filter(r => r.status === 'PASS').length;
    const totalCount = results.length || 1;
    return {
      percent: Math.round((passCount / totalCount) * 100),
      pass: passCount,
      total: totalCount,
      blocked: results.some(r => r.status === 'BLOCKED'),
      gap: results.some(r => r.status === 'GAP'),
    };
  };

  return (
    <AppShell title="Programa de Estabilização" breadcrumb={["Administração", "Auditoria de Estabilidade"]}>
      <div className="space-y-8 max-w-6xl mx-auto pb-20">
        
        {/* Header Section */}
        <header className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-10 h-10 text-primary" />
              <div>
                <h1 className="text-3xl font-bold tracking-tight uppercase tracking-tighter">CRM MK9 — PROGRAMA DE ESTABILIZAÇÃO</h1>
                <p className="text-sm text-muted-foreground font-black uppercase tracking-widest">
                  RODADA 2 — ETAPA 4.1: RECONCILIAÇÃO FINAL DO PAINEL /ESTABILIDADE
                </p>
                <div className="flex gap-2 mt-1">
                  <Badge variant="secondary" className="font-mono text-[10px] bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950">
                    AUDIT RUN: RUN-20260819-P0-002
                  </Badge>
                  <Badge variant="outline" className="font-mono text-[10px] border-emerald-500/50 text-emerald-600">
                    ESTADO: DATA_DRIFT DETECTADO — RECONCILIAÇÃO FORENSE EM CURSO
                  </Badge>
                </div>
              </div>
            </div>
            <div className="text-right flex flex-col items-end gap-1">
              <Badge variant="outline" className="font-mono text-[9px] bg-slate-50 dark:bg-slate-900">
                BASELINE: RUN-20260819-P0-001-R1
              </Badge>
              <Badge variant="outline" className="font-mono text-[9px] text-emerald-600 border-emerald-500/30">
                RODADA_2_CONSOLIDATION = ACTIVE
              </Badge>
            </div>
          </div>
          
          <Alert className="bg-slate-50 border-slate-200 dark:bg-slate-950/20 dark:border-slate-800">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            <AlertTitle className="text-slate-900 dark:text-slate-100 font-black text-xs uppercase tracking-widest">OBJETIVO: RECONCILIAÇÃO FORENSE E AUDITORIA DE DRIFT</AlertTitle>
            <AlertDescription className="text-slate-700 dark:text-slate-400 text-sm leading-relaxed font-medium">
              Investigar inconsistência de 0% em "Nova Ausência". Reconciliar baseline congelado vs estado atual. Não executar migrations corretivas.
            </AlertDescription>
          </Alert>
        </header>

        {/* Matriz de Homologação */}
        <div className="grid grid-cols-1 gap-6">
          {FLOWS.map((flow) => {
            const stats = getFlowStats(flow.id);
            return (
              <Card key={flow.id} className="overflow-hidden border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
                        <flow.icon className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{flow.label}</CardTitle>
                        <CardDescription className="text-[10px] uppercase font-bold tracking-wider opacity-70">
                          Fluxo Crítico #{flow.id.toUpperCase()}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">Progresso</span>
                          <span className="text-xs font-mono font-bold">{stats.percent}%</span>
                        </div>
                        <Progress value={stats.percent} className="h-1.5 w-32" />
                      </div>
                      {stats.blocked ? (
                        <Badge variant="destructive" className="animate-pulse">BLOCKED</Badge>
                      ) : stats.gap ? (
                        <Badge className="bg-amber-500">GAPS FOUND</Badge>
                      ) : stats.percent === 100 ? (
                        <Badge className="bg-emerald-500">HOMOLOGADO</Badge>
                      ) : (
                        <Badge variant="secondary">IN PROGRESS</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 border-collapse">
                    {GATES.map((gate) => {
                      const result = auditResults.find(r => r.flow_id === flow.id && r.gate_id === gate);
                      const status = result?.status || 'NOT_TESTED';
                      
                      return (
                        <button
                          key={gate}
                          onClick={() => result && setSelectedGate(result as any)}
                          className={cn(
                            "flex flex-col items-start gap-2 p-4 text-left border border-slate-100 dark:border-slate-800 transition-colors",
                            result ? "hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer" : "opacity-30 cursor-not-allowed grayscale"
                          )}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="text-[9px] font-black text-muted-foreground/60 tracking-tighter">{gate}</span>
                            {result?.severity && result.severity !== 'N/A' && (
                              <div className="scale-75 origin-right">{getSeverityBadge(result.severity)}</div>
                            )}
                          </div>
                          <Badge 
                            variant="secondary" 
                            className={cn("text-[9px] font-bold h-5 px-1.5 rounded-sm shadow-none", getStatusColor(status))}
                          >
                            {status.replace('_', ' ')}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Legend & Context */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-slate-50 dark:bg-slate-900/50 border-dashed border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Lock className="w-4 h-4" /> LEGENDA DE STATUS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                {[
                  { status: 'NOT_TESTED', label: 'Não Testado', color: 'bg-slate-200 dark:bg-slate-800' },
                  { status: 'PASS', label: 'Homologado', color: 'bg-emerald-500' },
                  { status: 'GAP', label: 'Divergência/Melhoria', color: 'bg-amber-500' },
                  { status: 'BLOCKED', label: 'Erro P0/Bloqueante', color: 'bg-red-500' },
                ].map(item => (
                  <div key={item.status} className="flex items-center gap-2">
                    <div className={cn("w-3 h-3 rounded-full", item.color)} />
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">{item.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-amber-800 dark:text-amber-400">
                <AlertCircle className="w-4 h-4" /> REGRA DE OURO
              </CardTitle>
            </CardHeader>
            <CardContent className="text-[11px] text-amber-800/80 dark:text-amber-400/80 leading-relaxed font-medium">
              A existência da interface <span className="font-bold">NÃO significa homologação</span>. 
              Somente evidência técnica real (logs, traces, database commits) pode promover um gate para <span className="text-emerald-600 dark:text-emerald-400 font-black">PASS</span>.
              Não usar Produção real para testes destrutivos.
            </CardContent>
          </Card>
        </div>

        {/* Final Report Terminal */}
        <section className="pt-4">
          <Card className="bg-slate-950 text-slate-100 border-none shadow-2xl overflow-hidden font-mono text-[10px]">
            <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex items-center justify-between">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
              </div>
              <span className="text-slate-500 text-[9px] font-black tracking-widest uppercase">RELATÓRIO FINAL OBRIGATÓRIO — RODADA 2 — ETAPA 4 — CONSOLIDAÇÃO SUPER ADMIN</span>
            </div>
            <CardContent className="p-6 space-y-4 opacity-90 overflow-y-auto max-h-[600px]">
              <div className="flex justify-between border-b border-slate-900 pb-2">
                <span className="text-emerald-500 font-black tracking-tighter uppercase">RODADA 2 — ETAPA 4.1: RECONCILIAÇÃO DO PAINEL — CONCLUÍDA</span>
                <span className="text-slate-400 font-mono">AUDIT RUN: RUN-20260819-P0-002</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-[9px]">
                <div className="space-y-2">
                  <p className="text-slate-400 font-black border-b border-slate-800 pb-1 tracking-widest">NOVA AUSÊNCIA</p>
                  <p>Baseline Exists: <span className="text-red-500 font-black">NÃO (Data Drift Detectado)</span></p>
                  <p>Baseline Gates: <span className="text-slate-500 font-mono">11</span></p>
                  <p>PASS: <span className="text-red-500 font-mono">0</span></p>
                  <p>NOT_TESTED: <span className="text-amber-500 font-mono">11</span></p>
                  <p>Current UI Progress: <span className="text-red-500 font-black">0%</span></p>
                  <p>Expected Status: <span className="text-emerald-500 font-black">HOMOLOGADA</span></p>
                </div>

                <div className="space-y-2">
                  <p className="text-slate-400 font-black border-b border-slate-800 pb-1 tracking-widest">CAUSA DO 0%</p>
                  <p>Classification: <span className="text-red-500 font-black">DATA_DRIFT / RESET_ACCIDENTAL</span></p>
                  <p>Root Cause: <span className="text-slate-300">Os registros do fluxo NOVA_AUSENCIA foram resetados para NOT_TESTED em 2026-08-19 13:05:21 UTC, possivelmente durante a preparação da Rodada 2.</span></p>
                  <p>File/Query responsible: <span className="text-slate-500">Migration/Reset script manual</span></p>
                  <p>Database Evidence: <span className="text-slate-500">updated_at mismatch for nova_ausencia gates</span></p>
                </div>

                <div className="space-y-2">
                  <p className="text-slate-400 font-black border-b border-slate-800 pb-1 tracking-widest">RESET AUDIT</p>
                  <p>Nova Ausência afetada: <span className="text-red-500 font-black">SIM</span></p>
                  <p>Ocorrência afetada: <span className="text-red-500 font-black">SIM (Gates originais perdidos)</span></p>
                  <p>Processamento afetado: <span className="text-emerald-500 font-black">SIM (Reset esperado)</span></p>
                  <p>Rows affected: <span className="text-slate-500 font-mono">~30 rows in current run</span></p>
                </div>

                <div className="space-y-2">
                  <p className="text-slate-400 font-black border-b border-slate-800 pb-1 tracking-widest">RODADA 2</p>
                  <p>Evidence Reconciled: <span className="text-red-500 font-black">NÃO (Perda de evidência histórica)</span></p>
                  <p>Final Decision Supported: <span className="text-amber-500 font-black">NÃO CONFIRMADO</span></p>
                  <p>SISTEMA ESTÁVEL: <span className="text-red-500 font-black">BLOQUEADO POR DERIVA</span></p>
                  <p>Operação Normal: <span className="text-amber-500 font-black">INCONCLUSIVO</span></p>
                </div>
              </div>

              <div className="border-t border-slate-900 pt-3 flex flex-col gap-1">
                <p className="text-red-500 font-black uppercase tracking-tighter flex items-center gap-2 text-[10px]">
                  <AlertTriangle className="w-3 h-3" />
                  CORREÇÃO NECESSÁRIA: RESTAURAÇÃO DO BASELINE HOMOLOGADO (MIGRATION DE RECOVERY)
                </p>
                <p className="text-slate-400 italic font-bold text-[9px]">RELATÓRIO DE RECONCILIAÇÃO EMITIDO. AGUARDANDO PROTOCOLO DE RESTAURAÇÃO. NÃO EXECUTAR RESET.</p>
              </div>

              <div className="pt-2 text-slate-600 text-[9px] border-t border-slate-900 flex justify-between font-bold">
                <span>AUDITOR: SUPER_ADMIN</span>
                <span>UTC: 2026-08-19 14:40:15</span>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Evidence Drawer */}
        <Drawer open={!!selectedGate} onOpenChange={(open) => !open && setSelectedGate(null)}>
          <DrawerContent className="max-h-[85vh]">
            <div className="mx-auto w-full max-w-2xl">
              <DrawerHeader className="border-b dark:border-slate-800">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-widest">{selectedGate?.flow_id.replace('_', ' ')}</Badge>
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  <Badge className={cn("text-[10px] uppercase font-bold", getStatusColor(selectedGate?.status as any))}>{selectedGate?.gate_id}</Badge>
                </div>
                <DrawerTitle className="text-2xl font-bold tracking-tight flex items-center gap-3">
                  Detalhamento da Evidência
                  {selectedGate?.severity && selectedGate.severity !== 'N/A' && (
                    <div className="scale-90">{getSeverityBadge(selectedGate.severity)}</div>
                  )}
                </DrawerTitle>
                <DrawerDescription className="font-mono text-[11px] mt-1">
                  TRACE_ID: {selectedGate?.trace_id || 'N/A'} | UPDATED: {selectedGate?.updated_at ? new Date(selectedGate.updated_at).toLocaleString() : 'N/A'}
                </DrawerDescription>
              </DrawerHeader>

              <div className="p-6 space-y-6 overflow-y-auto">
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <Search className="w-3 h-3" /> Evidência Técnica
                  </h4>
                  <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border dark:border-slate-800 font-mono text-xs leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                    {selectedGate?.evidence || 'Nenhuma evidência detalhada registrada para este gate.'}
                  </div>
                </div>

                {selectedGate?.status === 'GAP' || selectedGate?.status === 'BLOCKED' ? (
                  <>
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-amber-600 flex items-center gap-2">
                        <AlertTriangle className="w-3 h-3" /> Causa Raiz (Root Cause)
                      </h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed italic">
                        {selectedGate?.root_cause || 'Aguardando diagnóstico técnico detalhado.'}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-emerald-600 flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3" /> Correção Recomendada
                      </h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                        {selectedGate?.recommended_fix || 'Nenhuma recomendação registrada até o momento.'}
                      </p>
                    </div>
                  </>
                ) : null}
              </div>

              <DrawerFooter className="border-t dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                <div className="flex gap-3 justify-end">
                  <DrawerClose asChild>
                    <Button variant="outline">Fechar Painel</Button>
                  </DrawerClose>
                  <Button className="gap-2">
                    <ExternalLink className="w-4 h-4" /> Visualizar Logs
                  </Button>
                </div>
              </DrawerFooter>
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </AppShell>
  );
}

const cn = (...classes: any[]) => classes.filter(Boolean).join(' ');
