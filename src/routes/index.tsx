import { createFileRoute } from '@tanstack/react-router';
import { ShieldCheck, ClipboardCheck, ArrowRight, UserPlus, FileText, CheckCircle2, MessageSquare, AlertCircle, Lock, HardDrive, ShieldAlert, Cpu } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute('/')({
  component: HomologacaoE2EPage,
});

function HomologacaoE2EPage() {
  const auditRunId = "RUN-20260819-P0-E2E-SUP";

  return (
    <AppShell title="Homologação E2E" breadcrumb={["Sistema", "Homologação E2E"]}>
      <div className="max-w-4xl mx-auto space-y-8 pb-20">
        <header className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-xl">
                <ShieldCheck className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight uppercase">CRM MK9 — CENTRAL DE SUPORTE</h1>
                <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider">HOMOLOGAÇÃO OPERACIONAL E2E</p>
                <div className="flex gap-2 mt-1">
                  <Badge variant="outline" className="font-mono text-[10px] border-primary/30 text-primary uppercase">
                    SUPERVISOR → RH → SUPERVISOR
                  </Badge>
                </div>
              </div>
            </div>
            <div className="text-right">
              <Badge variant="outline" className="font-mono text-[10px] bg-slate-950 text-white">
                AUDIT_RUN: {auditRunId}
              </Badge>
            </div>
          </div>

          <Card className="bg-blue-50/50 border-blue-100 dark:bg-blue-950/20 dark:border-blue-900">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-start gap-3">
                <ClipboardCheck className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-black uppercase tracking-widest text-blue-700">OBJETIVO</h4>
                  <p className="text-xs text-blue-800/80 leading-relaxed font-medium">
                    Executar uma homologação ponta a ponta da Central de Suporte utilizando os recursos JÁ implementados. 
                    Esta etapa é de TESTE e DIAGNÓSTICO.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  "NÃO implementar novas funcionalidades",
                  "NÃO corrigir falhas automaticamente",
                  "NÃO alterar módulos operacionais"
                ].map((rule, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] font-bold text-red-600 uppercase tracking-tighter">
                    <ShieldAlert className="w-3 h-3" /> {rule}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </header>

        <section className="space-y-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">FLUXO DO PROTOCOLO</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            {[
              { label: 'SUPERVISOR', icon: UserPlus, sub: 'Cria chamado' },
              { label: 'RH', icon: MessageSquare, sub: 'Recebe' },
              { label: 'RH', icon: Lock, sub: 'Assume' },
              { label: 'RH', icon: MessageSquare, sub: 'Responde' },
              { label: 'SUPERVISOR', icon: Cpu, sub: 'Recebe' },
              { label: 'CHAT', icon: MessageSquare, sub: 'Continua' },
              { label: 'RH', icon: CheckCircle2, sub: 'Resolve' },
              { label: 'HISTÓRICO', icon: HardDrive, sub: 'Consulta' }
            ].map((step, i) => (
              <div key={i} className="flex flex-col items-center text-center p-2 rounded-lg border bg-card/50">
                <step.icon className="w-4 h-4 mb-2 text-primary" />
                <span className="text-[9px] font-black uppercase tracking-tighter leading-none mb-1">{step.label}</span>
                <span className="text-[8px] text-muted-foreground font-bold leading-tight">{step.sub}</span>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
              <ArrowRight className="w-4 h-4" /> ETAPAS DE EXECUÇÃO
            </h3>

            <div className="grid gap-4">
              {[
                { title: 'ETAPA 1 — SUPERVISOR / ABERTURA', content: 'Autenticar com perfil Supervisor. Confirmar que o FAB [Suporte] está visível. Abrir UM chamado controlado com categoria permitida. Assunto: TESTE DE HOMOLOGAÇÃO — CENTRAL DE SUPORTE. Validar persistência, protocolo SUP-*, created_by e ausência de duplicidade.' },
                { title: 'ETAPA 2 — VISÃO DO SUPERVISOR', content: 'Confirmar que o chamado aparece em "Meus chamados". Validar protocolo, categoria, assunto e status. O Supervisor NÃO pode visualizar chamados de terceiros.' },
                { title: 'ETAPA 3 — RH / RECEBIMENTO', content: 'Autenticar com RH. Confirmar chamado na fila correta. Validar protocolo, solicitante, contexto seguro e prioridade/SLA.' },
                { title: 'ETAPA 4 — RH / ASSUMIR CHAMADO', content: 'RH clica para assumir. Validar concorrência server-side. assigned_to deve ser o RH correto. Simular tentativa de segundo atendente assumir (deve ser bloqueado).' },
                { title: 'ETAPA 5 — RH ENVIA RESPOSTA', content: 'Enviar: "Olá! Recebemos seu chamado de homologação...". Validar persistência, autoria, realtime e badge unread para o Supervisor.' },
                { title: 'ETAPA 6 — SUPERVISOR RECEBE', content: 'Retornar ao Supervisor. Observar badge/unread e realtime sem refresh manual. Unread deve zerar ao abrir.' },
                { title: 'ETAPA 7 — SUPERVISOR RESPONDE', content: 'Supervisor responde para concluir chat. Validar ordenação cronológica e ausência de duplicidade.' },
                { title: 'ETAPA 8 — RH RECEBE EM REALTIME', content: 'Retornar ao RH. Confirmar recepção sem refresh manual. Validar unread e conteúdo.' },
                { title: 'ETAPA 9 — ANEXOS', content: 'Se homologado: testar upload de arquivo inofensivo. Validar bucket privado e bloqueio de acesso não autorizado. Se não: NOT_APPLICABLE.' },
                { title: 'ETAPA 10 — CONTEXTO TÉCNICO', content: 'RH/Admin validam context seguro. Supervisor NÃO deve visualizar stack traces, tokens ou segredos técnicos.' },
                { title: 'ETAPA 11 — RESOLUÇÃO', content: 'RH resolve chamado com diagnóstico "Homologação concluída". Validar status RESOLVIDO, resolved_at e histórico.' },
                { title: 'ETAPA 12 — SUPERVISOR PÓS-RESOLUÇÃO', content: 'Supervisor deve abrir o chamado resolvido e ver o histórico completo.' },
                { title: 'ETAPA 13 — REABERTURA', content: 'Se contratado: testar reabertura. Caso contrário: NOT_APPLICABLE.' },
                { title: 'ETAPA 14 — ISOLAMENTO', content: 'Teste Negativo: outro Supervisor tenta acessar o ID do ticket. Deve retornar BLOCKED/NOT FOUND.' }
              ].map((step, i) => (
                <Card key={i} className="border-l-4 border-l-primary/30">
                  <CardHeader className="py-3">
                    <CardTitle className="text-[11px] font-black uppercase tracking-widest">{step.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="py-0 pb-4">
                    <p className="text-xs text-muted-foreground leading-relaxed">{step.content}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <Card className="bg-slate-950 text-slate-100 font-mono text-[10px] overflow-hidden border-none shadow-2xl">
            <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex items-center justify-between">
              <span className="text-slate-500 font-black tracking-widest uppercase">RELATÓRIO FINAL OBRIGATÓRIO</span>
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500/50" />
                <div className="w-2 h-2 rounded-full bg-amber-500/50" />
              </div>
            </div>
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between border-b border-slate-900 pb-2">
                <span className="text-blue-500 font-black">CRM MK9 — HOMOLOGAÇÃO E2E</span>
                <span className="text-slate-400">RUN_ID: {auditRunId}</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-slate-400 font-black border-b border-slate-900 pb-1 uppercase">SUPERVISOR</p>
                  <p>FAB / OPEN TICKET: <span className="text-slate-600">[WAITING]</span></p>
                  <p>MY TICKETS / CATEGORY: <span className="text-slate-600">[WAITING]</span></p>
                  <p>CHAT (SEND/RECEIVE): <span className="text-slate-600">[WAITING]</span></p>
                </div>
                <div className="space-y-1">
                  <p className="text-slate-400 font-black border-b border-slate-900 pb-1 uppercase">RH</p>
                  <p>QUEUE / ASSIGNMENT: <span className="text-slate-600">[WAITING]</span></p>
                  <p>CONCURRENCY / RESOLUTION: <span className="text-slate-600">[WAITING]</span></p>
                  <p>REALTIME / UNREAD: <span className="text-slate-600">[WAITING]</span></p>
                </div>
                <div className="space-y-1">
                  <p className="text-slate-400 font-black border-b border-slate-900 pb-1 uppercase">SECURITY</p>
                  <p>ISOLATION / RBAC: <span className="text-slate-600">[WAITING]</span></p>
                  <p>SAFE CONTEXT: <span className="text-slate-600">[WAITING]</span></p>
                </div>
                <div className="space-y-1">
                  <p className="text-slate-400 font-black border-b border-slate-900 pb-1 uppercase">REGRESSIONS</p>
                  <p>AUSÊNCIA / OCORRÊNCIA: <span className="text-slate-500 font-black">PRESERVED</span></p>
                  <p>BASE CONHECIMENTO: <span className="text-slate-500 font-black">PRESERVED</span></p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-900 flex justify-between">
                <div className="flex gap-2">
                  <Badge variant="outline" className="border-slate-800 text-slate-500 font-black">SUPPORT_E2E_READY: NÃO</Badge>
                  <Badge variant="outline" className="border-red-500 text-red-500 font-black animate-pulse">STATUS: PARADO</Badge>
                </div>
                <span className="text-slate-600 uppercase font-bold">Auditor: AGUARDANDO_EXECUCAO</span>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </AppShell>
  );
}

