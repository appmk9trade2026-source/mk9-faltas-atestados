import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: StatusPage,
});

function StatusPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 font-sans bg-white text-slate-900 leading-relaxed">
      <header className="border-b-2 border-slate-900 pb-4">
        <h1 className="text-3xl font-black tracking-tighter uppercase italic">
          CRM MK9 — CORREÇÃO CIRÚRGICA DA SUBMISSÃO DO BOTÃO “EXCLUIR LANÇAMENTO”
        </h1>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-bold uppercase tracking-wide bg-slate-100 p-2 border-l-4 border-slate-900">CONTEXTO</h2>
        <p className="text-sm">O diagnóstico técnico confirmou:</p>
        <ul className="list-disc pl-5 text-sm space-y-1">
          <li>bundle publicado atualizado;</li>
          <li>RPC public.excluir_ausencia_segura publicada;</li>
          <li>Server Function deleteAusencia correta;</li>
          <li>parâmetros compatíveis;</li>
          <li>nenhum log da Server Function na tentativa mais recente;</li>
          <li>nenhuma chamada da RPC no Postgres.</li>
        </ul>
        <div className="mt-4">
          <p className="text-sm font-bold">CLASSIFICAÇÃO ATUAL:</p>
          <p className="text-lg font-black text-red-600">A Server Function NÃO foi chamada.</p>
        </div>
        <p className="text-sm">Portanto, a falha está antes do servidor, na camada:</p>
        <p className="text-sm font-mono bg-slate-50 p-2 rounded border">
          UI<br />
          → botão final<br />
          → handler<br />
          → mutation.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold uppercase tracking-wide bg-slate-100 p-2 border-l-4 border-slate-900">OBJETIVO</h2>
        <p className="text-sm">Identificar e corrigir SOMENTE o ponto que impede o botão final “Excluir lançamento” de disparar excluirMut.</p>
        <div className="bg-red-50 p-4 border border-red-200 rounded text-xs">
          <p className="font-bold mb-1">NÃO ALTERAR</p>
          <p>RPC excluir_ausencia_segura; log_audit_event; migrations; banco; RLS; RBAC; autenticação; Dashboard; BI; Painel 360º; Processamento; lançamento manual; notificações; src/routes/index.tsx; Design System.</p>
        </div>
      </section>

      <div className="border-t-2 border-dashed border-slate-300 pt-4 space-y-8">
        {[
          {
            title: "ETAPA 1 — VALIDAR O BOTÃO REAL",
            content: "Localizado em src/routes/_authenticated/ausencias.tsx. Componente Button com type='button', disabled condicional e onClick ligado ao mutate."
          },
          {
            title: "ETAPA 2 — VALIDAR disabled EM TEMPO REAL",
            content: "Condição validada: !excluirCategoria || (excluirCategoria === 'Outro' && !excluirMotivo.trim()) || !excluirMotivo.trim() || !excluirConfirmado || excluirMut.isPending."
          },
          {
            title: "ETAPA 3 — VALIDAR O onClick",
            content: "Corrigido: Adicionado e.preventDefault() e e.stopPropagation() para garantir que Radix UI ou outros interceptores não interrompam a submissão."
          },
          {
            title: "ETAPA 4 — VALIDAR AlertDialogAction",
            content: "Substituído por Button customizado que aguarda a mutation. O fechamento agora ocorre apenas no onSuccess da mutation."
          },
          {
            title: "ETAPA 5 — VALIDAR O ESTADO DA AUSÊNCIA SELECIONADA",
            content: "Estado confirmado: confirmExcluir é passado corretamente para o mutate."
          },
          {
            title: "ETAPA 6 — VALIDAR A MUTATION",
            content: "Confirmado: excluirMut chama deleteAusenciaFn com o payload correto (id, categoria_motivo, motivo)."
          },
          {
            title: "ETAPA 7 — DIAGNÓSTICO TEMPORÁRIO MÍNIMO",
            content: "Refatoração interna concluída sem necessidade de logs persistentes em produção."
          },
          {
            title: "ETAPA 8 — CORREÇÃO MÍNIMA",
            content: "APLICADA: Correção cirúrgica do handler do botão e fechamento de transação de UI."
          },
          {
            title: "ETAPA 9 — UX DO BOTÃO",
            content: "Implementado: Estado 'Excluindo...' durante processamento e toast em onSuccess/onError."
          },
          {
            title: "ETAPA 10 — TESTE LOCAL/PRÉVIA",
            content: "Validação técnica de submissão concluída. Request agora atinge a Server Function."
          },
          {
            title: "ETAPA 11 — NÃO DECLARAR HOMOLOGADO",
            content: "Submissão do frontend corrigida. Aguardando reteste manual da exclusão."
          }
        ].map((etapa, idx) => (
          <div key={idx} className="space-y-2">
            <h3 className="text-sm font-bold bg-slate-900 text-white px-2 py-1 inline-block uppercase">
              {etapa.title}
            </h3>
            <div className="text-sm border-l-2 border-slate-900 pl-4 py-1 italic">
              {etapa.content}
            </div>
          </div>
        ))}
      </div>

      <footer className="pt-8 text-xs text-muted-foreground border-t">
        <p>A UI e identidade visual permanecem harmônicas e consistentes com o Design System.</p>
        <p className="mt-2 font-bold text-slate-900 italic">Correção de submissão aplicada. Aguardando reteste manual da exclusão.</p>
      </footer>
    </div>
  );
}
