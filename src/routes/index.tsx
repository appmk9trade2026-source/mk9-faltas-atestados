import { createFileRoute, redirect } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/')({
  loader: async () => {
    // HOMOLOGAÇÃO DO CAMPO manual_nome NO LANÇAMENTO MANUAL (ETAPA FINAL)
    //
    // 1. ORIGENS DA MENSAGEM:
    //    - Frontend: src/routes/_authenticated/nova-ausencia.tsx:236 (superRefine)
    //    - Server: src/lib/ausencias.functions.ts:79 (manualPayloadSchema)
    //
    // 2. CONDIÇÃO: (v.manual_nome || "").trim().length < 3 quando modo_manual=true.
    //
    // 3. CAUSA RAIZ SUSPEITA:
    //    - O Input no frontend usa {...form.register("manual_nome")}.
    //    - O schema valida manual_nome.
    //    - Se a mensagem aparece, o safeParse está recebendo manual_nome vazio ou < 3.
    //
    // 4. TESTE OBRIGATÓRIO (GUSTAVO WILLIAM FERREIRA):
    //    - Preencher matrícula 2727 (inexistente).
    //    - Ativar preenchimento manual.
    //    - Preencher nome completo.
    //    - Verificar no console log "DEBUG_LANCAMENTO_MANUAL_FE" o valor enviado.
    
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      throw redirect({ to: '/dashboard' });
    }
    
    throw redirect({ to: '/auth' });
  },
  component: () => null,
});
