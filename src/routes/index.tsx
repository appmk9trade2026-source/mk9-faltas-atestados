import { createFileRoute, redirect } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/')({
  loader: async () => {
    // CRM MK9 — HOMOLOGAR E ENDURECER A CORREÇÃO DE manual_nome NO LANÇAMENTO MANUAL
    //
    // PROJECT REF
    // wgozydjiuimxxddhodax
    //
    // CONTEXTO
    // A causa raiz do falso erro de validação foi identificada:
    // O objeto values recebido pelo handleSubmit podia não conter o valor atualizado de manual_nome e de outros campos manuais no momento do clique, especialmente quando o último campo ainda não havia disparado blur ou change final.
    // Foi aplicado fallback: (values.manual_nome || form.getValues("manual_nome") || "").trim()
    //
    // OBJETIVO
    // Homologar a correção no ambiente publicado e garantir que o fallback não esteja apenas mascarando uma ligação incorreta entre o input e o React Hook Form.
    //
    // ETAPAS DE HOMOLOGAÇÃO:
    // 1. Validar vinculação do Input (manual_nome, value, onChange, onBlur, ref).
    // 2. Validar o Submit (handleSubmit + nullish coalescing ?? para fallbacks).
    // 3. Centralizar normalização (normalizeManualText).
    // 4. Validar todos os campos manuais (nome, email, tel, etc).
    // 5. Teste obrigatório sem blur (reprodução da causa raiz).
    // 6. Teste mobile/teclado/autofill.
    // 7. Teste real Supervisor (GUSTAVO WILLIAM FERREIRA).
    // 8. Teste RH/Admin.
    // 9. Teste reutilização de matrícula.
    // 10. Suíte de testes automatizados.

    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      throw redirect({ to: '/dashboard' });
    }
    
    throw redirect({ to: '/auth' });
  },
  component: () => null,
});
