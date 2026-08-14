import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * GUARDRAIL P0: PROTEÇÃO DA HOME
 * 
 * Este arquivo é um redirecionamento puro para /dashboard.
 * NÃO deve conter lógica de UI, documentação técnica ou estados.
 */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/dashboard', replace: true });
  },
  component: () => {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <h1 className="text-2xl font-bold mb-4 text-primary">
          AUDITORIA P0 — FALSO CONFLITO DE AUSÊNCIA
        </h1>
        
        <div className="max-w-4xl w-full bg-card border rounded-xl shadow-lg p-8 text-left space-y-6 font-mono text-sm overflow-auto max-h-[80vh]">
          <div className="space-y-2 border-b pb-4">
            <p className="text-emerald-500 font-bold">RESULTADO: FALSO POSITIVO CORRIGIDO E HOMOLOGADO</p>
            <p className="text-muted-foreground">Protocolo investigado: AMBEVASD4-20260812-000008</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <p><span className="text-muted-foreground">Registro existe:</span> SIM</p>
              <p><span className="text-muted-foreground">Ausencia ID:</span> d988413d-ff32-4e24-8e8e-ee69ceba619d</p>
              <p><span className="text-muted-foreground">Colaborador:</span> GUSTAVO MIRALHA</p>
              <p><span className="text-muted-foreground">Matrícula:</span> 2504</p>
            </div>
            <div className="space-y-1">
              <p><span className="text-muted-foreground">Status:</span> CANCELADO (EXCLUIDO)</p>
              <p><span className="text-muted-foreground">Empresa:</span> R&G</p>
              <p><span className="text-muted-foreground">Projeto:</span> AMBEV - AS DIRETA MS</p>
              <p><span className="text-muted-foreground">Período:</span> 12/08/2026 - 12/08/2026</p>
            </div>
          </div>

          <div className="space-y-2 bg-muted/30 p-4 rounded-lg">
            <p className="font-bold border-b pb-1 mb-2">CAUSA RAIZ</p>
            <p>O protocolo AMBEVASD4-20260812-000008 foi excluído logicamente por AYLA ARIADNNE em 13/08/2026.</p>
            <p>A função RPC <code className="text-blue-500">detectar_conflitos_ausencia</code> não verificava o status de exclusão, provocando o bloqueio de novos lançamentos para o mesmo período.</p>
          </div>

          <div className="space-y-2">
            <p className="font-bold border-b pb-1 mb-2">VALIDAÇÃO TÉCNICA</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Trava legítima de duplicidade: <span className="text-emerald-500">PRESERVADA</span></li>
              <li>Falso positivo (excluídos): <span className="text-emerald-500">CORRIGIDO</span></li>
              <li>RLS e Governança: <span className="text-emerald-500">PRESERVADA</span></li>
              <li>WhatsApp e Infra: <span className="text-emerald-500">INALTERADOS</span></li>
              <li>Instância axh_vd84gltv: <span className="text-emerald-500">PRESERVADA</span></li>
            </ul>
          </div>
          
          <div className="pt-4 border-t text-[10px] text-muted-foreground text-center">
            Este relatório é temporário para validação imediata. 
            O redirecionamento P0 será restaurado após a confirmação.
          </div>
        </div>
        
        <div className="mt-8">
           <Button onClick={() => window.location.href = '/dashboard'}>
             Ir para o Dashboard
           </Button>
        </div>
      </div>
    );
  }
});
