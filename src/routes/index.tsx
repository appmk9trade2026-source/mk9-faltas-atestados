import { createFileRoute } from '@tanstack/react-router';
import { ShieldCheck, ClipboardCheck, AlertCircle, FileText, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute('/')({
  component: IncidentDiagnosePage,
});

function IncidentDiagnosePage() {
  return (
    <AppShell title="Diagnóstico de Incidente" breadcrumb={["Sistema", "Diagnóstico de Incidente"]}>
      <div className="max-w-4xl mx-auto space-y-8 pb-20 font-mono text-sm">
        <header className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-500/10 rounded-xl">
              <ShieldCheck className="w-8 h-8 text-red-600" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight uppercase text-red-900">CRM MK9 — CENTRAL DE SUPORTE</h1>
              <p className="text-xs font-bold text-red-700 uppercase tracking-widest">INCIDENTE P1 — PARTE 1/5</p>
              <h2 className="text-lg font-bold">DIAGNÓSTICO FORENSE DO "UNAUTHORIZED" AO ABRIR CHAMADO</h2>
            </div>
          </div>
        </header>

        <section className="space-y-4">
          <h3 className="text-sm font-black uppercase text-slate-800">CONTEXTO</h3>
          <p>Durante a homologação E2E da Central de Suporte, um usuário autenticado abriu o FAB de Suporte, preenchieu o formulário "Novo Chamado de Suporte" e, ao clicar em "Abrir Chamado", recebeu:</p>
          <div className="p-4 bg-red-50 border border-red-200 text-red-800 font-bold">"Unauthorized"</div>
          <p>O formulário abriu normalmente.</p>
          <p className="font-bold">Portanto: FAB = FUNCIONAL / FORMULÁRIO = FUNCIONAL / SUBMISSÃO = FAIL</p>
          <p className="font-bold text-red-600">OBJETIVO: Descobrir EXATAMENTE onde o "Unauthorized" está sendo gerado. NÃO corrigir nada. NÃO alterar RBAC/RLS/server functions. Somente diagnosticar.</p>
        </section>

        <section className="space-y-4 border-t pt-6">
          <h3 className="text-sm font-black uppercase">1 — IDENTIFICAR A SESSÃO REAL</h3>
          <p>Reportar:</p>
          <ul className="list-disc pl-5">
            <li>AUTH_SESSION: VALID / INVALID</li>
            <li>EFFECTIVE_ROLE: [...]</li>
            <li>CAN_ACCESS_SUPPORT_UI: SIM / NÃO</li>
            <li>CAN_CREATE_SUPPORT_TICKET: SIM / NÃO</li>
          </ul>
        </section>

        <section className="space-y-4 border-t pt-6">
          <h3 className="text-sm font-black uppercase">2 — LOCALIZAR A ORIGEM DO "UNAUTHORIZED"</h3>
          <p>Rastrear o fluxo: FAB → Novo Chamado → submit handler → mutation → server function → helper de autorização → RPC/query → RLS → banco. Encontrar o ponto EXATO.</p>
          <ul className="list-disc pl-5">
            <li>SOURCE_FILE: [...]</li>
            <li>FUNCTION: [...]</li>
            <li>AUTH_HELPER: [...]</li>
            <li>FAILED_CHECK: [...]</li>
            <li>ERROR_ORIGIN: SERVER_FUNCTION / RBAC / RLS / SESSION / RPC / OTHER</li>
          </ul>
        </section>

        <section className="space-y-4 border-t pt-6">
          <h3 className="text-sm font-black uppercase">3 — COMPARAR MATRIZ DE PERMISSÕES</h3>
          <div className="p-4 bg-slate-100 font-mono text-xs">ROLE | FAB | FORM | CREATE SERVER | INSERT RLS</div>
        </section>

        <section className="space-y-4 border-t pt-6">
          <h3 className="text-sm font-black uppercase">4 — VERIFICAR SE CREATE TICKET EXIGE ROLE ERRADA</h3>
          <p>Auditar a função canônica. Distinguir SOLICITANTE (abre chamado) vs ATENDENTE (assume/responde). Confirmar se a regra mistura responsabilidades.</p>
        </section>

        <section className="space-y-4 border-t pt-6">
          <h3 className="text-sm font-black uppercase">5 — AUDITAR RLS DE INSERT</h3>
          <p>Verificar: INSERT policy, WITH CHECK, auth.uid(), requester_user_id, role checks.</p>
        </section>

        <section className="space-y-4 border-t pt-6">
          <h3 className="text-sm font-black uppercase">6 — INSPECIONAR O PAYLOAD REAL</h3>
          <p>Confirmar presença de: category, priority, subject, description, sourceRoute, sourceModule.</p>
        </section>

        <section className="space-y-4 border-t pt-6">
          <h3 className="text-sm font-black uppercase">7 — TESTAR ORIGEM DIRETA VS FAB</h3>
          <p>Abertura pela Central de Suporte vs FAB em /processamento. Registrar divergência.</p>
        </section>

        <section className="space-y-4 border-t pt-6">
          <h3 className="text-sm font-black uppercase">8 — VERIFICAR PERSISTÊNCIA PARCIAL</h3>
          <p>Após erro, verificar: TICKET_CREATED, PROTOCOL_CREATED, INITIAL_MESSAGE_CREATED, AUDIT_EVENT_CREATED, ORPHAN_DATA.</p>
        </section>

        <section className="space-y-4 border-t pt-6">
          <h3 className="text-sm font-black uppercase">9 — CLASSIFICAR A CAUSA</h3>
          <p>RBAC_DRIFT, RLS_POLICY, SESSION_INVALID, SERVER_FUNCTION_AUTH, ROLE_MISMATCH, PAYLOAD_AUTH, CONTEXTUAL_SUPPORT_PATH, OTHER, INCONCLUSIVE.</p>
        </section>

        <section className="space-y-6 pt-6 border-t-2 border-slate-900">
           <h3 className="text-lg font-black uppercase text-red-900">RELATÓRIO FINAL OBRIGATÓRIO</h3>
           <Card className="bg-slate-950 text-slate-100 font-mono text-[10px]">
             <CardContent className="p-4 space-y-2">
               <p>INCIDENTE: SUPPORT_CREATE_UNAUTHORIZED</p>
               <p>AUTH_SESSION: [...]</p>
               <p>EFFECTIVE_ROLE: [...]</p>
               <p>SOURCE_FILE: [...]</p>
               <p>ROOT_CAUSE: [...]</p>
               <p className="pt-4 text-red-400 font-bold">CORRECTION_REQUIRED: SIM / NÃO</p>
               <p className="font-black pt-4">NÃO IMPLEMENTAR A CORREÇÃO. PARAR. Aguardar a Parte 2.</p>
             </CardContent>
           </Card>
        </section>
      </div>
    </AppShell>
  );
}
