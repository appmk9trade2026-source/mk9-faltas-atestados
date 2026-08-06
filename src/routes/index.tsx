import { createFileRoute, redirect } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/')({
  loader: async () => {
    // CRM MK9 — EXECUTAR O RASTREAMENTO E IDENTIFICAR A VALIDAÇÃO RESPONSÁVEL
    //
    // PROJECT REF
    // wgozydjiuimxxddhodax
    //
    // CONTEXTO
    // Os marcadores de diagnóstico já foram adicionados nas seguintes camadas:
    // 
    // 1. Frontend Schema
    //    src/routes/_authenticated/nova-ausencia.tsx
    //    superRefine
    // 
    // 2. Server Function Schema
    //    src/lib/ausencias.functions.ts
    //    manualPayloadSchema
    // 
    // 3. Server Function Input Validator
    //    src/lib/ausencias.functions.ts
    //    inputValidator
    // 
    // 4. Frontend Mutation
    //    src/routes/_authenticated/nova-ausencia.tsx
    //    onError
    //
    // O erro continua sendo:
    //
    // “Os dados enviados são inválidos.
    // Informe o nome completo do colaborador (mínimo 3 caracteres).”
    //
    // OBJETIVO
    // Executar agora o fluxo real, coletar os logs correlacionados e identificar definitivamente qual camada gera a mensagem.
    //
    // Não pedir novamente para o usuário abrir o F12.
    //
    // O diagnóstico deve ser executado pelo agente no preview/ambiente de teste e apresentado de forma objetiva.
    //
    // DIRETRIZ DE SEGURANÇA
    // Não registrar payload bruto contendo:
    // - e-mail completo;
    // - telefone completo;
    // - WhatsApp;
    // - dados médicos;
    // - motivo da ausência;
    // - anexos;
    // - tokens;
    // - cookies;
    // - access token.
    //
    // Mascarar os dados pessoais.
    //
    // Pode registrar:
    // - presença ou ausência do campo;
    // - comprimento da string;
    // - primeiros e últimos caracteres mascarados;
    // - tipo do valor;
    // - estrutura das chaves;
    // - correlation_id.
    //
    // ETAPA 1 — CRIAR CORRELATION ID
    // No início do submit, gerar um identificador único, por exemplo:
    // manual-submit-<timestamp>-<random>
    // Propagar esse correlation_id por:
    // Frontend -> Mutation -> Server Function -> Validação -> RPC -> Resposta
    // Todos os logs devem conter o mesmo correlation_id.
    //
    // ETAPA 2 — REPRODUZIR O CASO
    // Usar o cenário:
    // Matrícula: 2727
    // Nome: GUSTAVO WILLIAM FERREIRA
    // Executar:
    // 1. matrícula inexistente;
    // 2. ativar preenchimento manual;
    // 3. preencher todos os campos obrigatórios;
    // 4. manter o foco no último campo;
    // 5. clicar diretamente em Enviar Lançamento;
    // 6. capturar a cadeia completa.

    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      throw redirect({ to: '/dashboard' });
    }
    
    throw redirect({ to: '/auth' });
  },
  component: () => null,
});