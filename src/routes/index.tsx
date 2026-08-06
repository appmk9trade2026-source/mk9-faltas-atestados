import { createFileRoute, redirect } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw redirect({
        to: '/auth',
      });
    }

    throw redirect({
      to: '/dashboard',
    });
  },
  component: () => (
    <div className="p-8 max-w-2xl mx-auto space-y-6 font-sans leading-relaxed">
      <h1 className="text-2xl font-bold border-b pb-4">
        CRM MK9 — PADRONIZAÇÃO DAS EVIDÊNCIAS DE HOMOLOGAÇÃO
      </h1>
      
      <p className="font-semibold">
        A partir desta etapa, nenhuma correção poderá ser considerada "validada", "corrigida", "homologada" ou "concluída" sem evidências objetivas.
      </p>

      <div className="space-y-2">
        <p className="font-medium underline">Sempre apresentar:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>ID do registro criado ou alterado;</li>
          <li>Protocolo gerado;</li>
          <li>Usuário responsável;</li>
          <li>Papel (Supervisor, RH, Super Admin);</li>
          <li>Status final;</li>
          <li>Resultado esperado;</li>
          <li>Resultado obtido;</li>
          <li>Evidência da operação (query, log ou retorno da RPC);</li>
          <li>Resultado dos testes de regressão.</li>
        </ul>
      </div>

      <div className="space-y-2">
        <p className="font-medium underline text-destructive">É proibido utilizar expressões como:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>"Validado com sucesso";</li>
          <li>"Corrigido";</li>
          <li>"Homologado";</li>
          <li>"Funcionando normalmente";</li>
        </ul>
        <p className="italic">sem apresentar as evidências correspondentes.</p>
      </div>

      <p className="pt-4 border-t font-medium text-muted-foreground">
        O relatório deve ser técnico, auditável e reproduzível.
      </p>
    </div>
  ),
});
