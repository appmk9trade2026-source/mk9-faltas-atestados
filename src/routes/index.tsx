import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      throw redirect({ to: "/dashboard" });
    }
    throw redirect({ to: "/auth" });
  },
  component: () => (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-xl border bg-white shadow-lg dark:bg-slate-900">
        <div className="bg-slate-900 px-6 py-8 text-white dark:bg-black">
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">
            CRM MK9 — EXECUTAR SOMENTE O TESTE FUNCIONAL DO LANÇAMENTO MANUAL
          </h1>
        </div>
        
        <div className="prose prose-slate max-w-none p-6 dark:prose-invert">
          <h3>CONTEXTO</h3>
          <p>
            A Home está corretamente protegida:<br />
            <code>src/routes/index.tsx</code> → redirecionamento operacional puro.
          </p>
          <p>O roteiro de homologação está fora do código-fonte.</p>

          <h3>OBJETIVO</h3>
          <p>
            Executar somente o teste funcional real do lançamento manual com perfil Supervisor e matrícula numérica comprovadamente inexistente.
          </p>
          <p className="font-bold text-red-600 dark:text-red-400">NÃO ALTERAR CÓDIGO ANTES DO TESTE.</p>

          <h3>NÃO ALTERAR:</h3>
          <ul className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
            <li>Home</li>
            <li>Autenticação</li>
            <li>RBAC</li>
            <li>RLS</li>
            <li>RPCs</li>
            <li>Banco</li>
            <li>Migrations</li>
            <li>Dashboard</li>
            <li>BI</li>
            <li>Painel 360º</li>
            <li>Processamento</li>
            <li>Exclusão lógica</li>
            <li>Auditoria Forense</li>
            <li>Notificações</li>
            <li>Design System</li>
          </ul>

          <div className="mt-8 space-y-6">
            <section>
              <h4 className="border-l-4 border-slate-900 pl-3 dark:border-white">ETAPA 1 — MATRÍCULA LIMPA</h4>
              <p>Escolher uma matrícula numérica compatível com o padrão real. Antes do teste, consultar o banco.</p>
              <p><strong>Resultado obrigatório:</strong> COUNT inicial = 0. Não inserir o colaborador manualmente pelo banco.</p>
            </section>

            <section>
              <h4 className="border-l-4 border-slate-900 pl-3 dark:border-white">ETAPA 2 — TESTE COM SUPERVISOR</h4>
              <p>Pela interface publicada: Nova Ausência → informar matrícula → Atualizar resultados → confirmar que não existe → Preenchimento manual. Preencher todos os campos obrigatórios normalmente.</p>
            </section>

            <section>
              <h4 className="border-l-4 border-slate-900 pl-3 dark:border-white">ETAPA 3 — VALIDAR O PROBLEMA ORIGINAL</h4>
              <p>Preencher Nome Completo válido. Clicar em Enviar Lançamento.</p>
              <p><strong>Resultado esperado:</strong> NÃO aparecer: “Informe o nome completo do colaborador (mínimo 3 caracteres).”</p>
            </section>

            <section>
              <h4 className="border-l-4 border-slate-900 pl-3 dark:border-white">ETAPA 4 — TESTE SEM BLUR</h4>
              <p>Preencher o último campo textual. Sem clicar fora do campo: clicar diretamente em “Enviar Lançamento”.</p>
              <p><strong>Resultado esperado:</strong> Submissão funciona; manual_nome não é perdido; telefones não são perdidos; demais campos manuais permanecem íntegros.</p>
            </section>

            <section>
              <h4 className="border-l-4 border-slate-900 pl-3 dark:border-white">ETAPA 5 — SE HOUVER QUALQUER ERRO</h4>
              <p className="font-bold text-red-600 dark:text-red-400">PARAR. NÃO corrigir automaticamente.</p>
              <p>Registrar: mensagem exata; perfil; matrícula; etapa; camada; erro técnico; arquivo/função relacionada, se identificável. Aguardar autorização.</p>
            </section>

            <section>
              <h4 className="border-l-4 border-slate-900 pl-3 dark:border-white">ETAPA 6 — SE FUNCIONAR</h4>
              <p>Consultar public.colaboradores. Apresentar: id; matrícula; nome_completo; empresa_id; projeto_id; supervisor_usuario_id; created_at.</p>
              <p><strong>Confirmar:</strong> COUNT após criação = 1.</p>
            </section>

            <section>
              <h4 className="border-l-4 border-slate-900 pl-3 dark:border-white">ETAPA 7 — VALIDAR AUSÊNCIA</h4>
              <p>Consultar public.ausencias. Apresentar: id; protocolo; colaborador_id; tipo; status; status_processamento; criado_por_usuario_id; created_at.</p>
              <p><strong>Confirmar:</strong> ausencias.colaborador_id = colaboradores.id</p>
            </section>

            <section>
              <h4 className="border-l-4 border-slate-900 pl-3 dark:border-white">ETAPA 8 — FIND-OR-CREATE</h4>
              <p>Pesquisar novamente a mesma matrícula pela interface.</p>
              <p><strong>Resultado esperado:</strong> Colaborador localizado; preenchimento manual não solicitado; nenhum segundo colaborador criado. Confirmar: COUNT final = 1.</p>
            </section>

            <section>
              <h4 className="border-l-4 border-slate-900 pl-3 dark:border-white">ETAPA 9 — AUDITORIA</h4>
              <p>Confirmar evento correspondente à criação da ausência. Apresentar: id; acao; registro_id; usuario_id; created_at.</p>
            </section>

            <section>
              <h4 className="border-l-4 border-slate-900 pl-3 dark:border-white">ETAPA 10 — NOTIFICAÇÕES</h4>
              <p>Verificar o estado real. Distinguir: ENFILEIRADA, ENVIADA, ENTREGUE, FALHOU. Não afirmar entrega sem evidência.</p>
            </section>
          </div>

          <div className="mt-10 rounded-lg bg-slate-100 p-4 dark:bg-slate-800">
            <h4 className="mt-0">CRITÉRIOS DE ACEITE</h4>
            <ul className="mb-0 text-sm">
              <li>COUNT inicial = 0;</li>
              <li>Criação exclusiva pela aplicação;</li>
              <li>Falso erro de nome não ocorre;</li>
              <li>Teste sem blur passa;</li>
              <li>Colaborador e Ausência criados;</li>
              <li>colaborador_id correto e Protocolo gerado;</li>
              <li>Find-or-Create funcional;</li>
              <li>COUNT final = 1.</li>
            </ul>
          </div>
        </div>

        <div className="border-t bg-slate-50 px-6 py-4 text-xs text-slate-500 dark:bg-slate-900">
          A UI e identidade visual devem permanecer bonitas, harmônicas, intuitivas, modernas e consistentes com o Design System atual.
        </div>
      </div>
    </div>
  ),
});
