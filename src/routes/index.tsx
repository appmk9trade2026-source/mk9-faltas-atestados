import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomologacaoComponent,
});

function HomologacaoComponent() {
  return (
    <div className="p-8 max-w-4xl mx-auto font-sans leading-relaxed text-foreground whitespace-pre-wrap">
      <h1 className="text-2xl font-bold mb-6">CRM MK9 — HOMOLOGAÇÃO FINAL DA EXCLUSÃO LÓGICA APÓS CORREÇÃO DE SCHEMA</h1>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">PROJECT REF</h2>
        <p className="font-mono bg-muted p-2 rounded">wgozydjiuimxxddhodax</p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">CONTEXTO</h2>
        <p>Foi corrigido o desalinhamento entre schema e RPC no fluxo de exclusão lógica.</p>
        <p className="mt-2">A coluna:</p>
        <code className="block bg-muted p-2 rounded my-2">public.ausencias.excluida_por_usuario_id</code>
        <p>foi criada via migration.</p>
        <p className="mt-2">A RPC:</p>
        <code className="block bg-muted p-2 rounded my-2">public.excluir_ausencia_segura</code>
        <p>foi atualizada para utilizar a estrutura correta do banco.</p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">OBJETIVO</h2>
        <p>Não implementar novas funcionalidades nesta etapa.</p>
        <p>Executar somente a homologação completa da exclusão lógica no ambiente publicado e apresentar evidências reais.</p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2 text-destructive">DIRETRIZ CRÍTICA</h2>
        <p className="mb-2">Não alterar novamente:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>schema de ausencias;</li>
          <li>RPC excluir_ausencia_segura;</li>
          <li>interface do diálogo de exclusão;</li>
          <li>autenticação;</li>
          <li>RBAC;</li>
          <li>RLS;</li>
          <li>criação de ausências;</li>
          <li>lançamento manual;</li>
          <li>edição;</li>
          <li>retificação;</li>
          <li>Processamento Interno;</li>
          <li>Painel 360º;</li>
          <li>Dashboard;</li>
          <li>BI Executivo;</li>
          <li>notificações;</li>
          <li>auditoria;</li>
          <li>contestações;</li>
          <li>Home;</li>
          <li>Melhorar com IA.</li>
        </ul>
        <p className="mt-4 font-bold">Nenhuma nova migration deve ser criada sem falha comprovada.</p>
      </section>

      <section className="mb-6 border-t pt-6">
        <h2 className="text-xl font-semibold mb-4 text-primary">ETAPA 1 — CONFIRMAR O SCHEMA REAL</h2>
        <p>Confirmar no banco publicado que existem:</p>
        <ul className="list-disc pl-5 mt-2">
          <li>status_documental;</li>
          <li>excluida_em;</li>
          <li>excluida_por_usuario_id;</li>
          <li>motivo_exclusao;</li>
          <li>categoria_motivo_exclusao;</li>
          <li>snapshots relacionados à exclusão, se previstos no modelo.</li>
        </ul>
        <p className="mt-2 italic">Apresentar tipo e nullable de cada campo.</p>
      </section>

      <section className="mb-6 border-t pt-6">
        <h2 className="text-xl font-semibold mb-4 text-primary">ETAPA 2 — CONFIRMAR A RPC REAL</h2>
        <p>Consultar pg_get_functiondef para:</p>
        <code className="block bg-muted p-2 rounded my-2 text-primary">public.excluir_ausencia_segura</code>
        <p>Confirmar que a função utiliza:</p>
        <code className="block bg-muted p-2 rounded my-2 text-primary">excluida_por_usuario_id = auth.uid()</code>
        <p>e não recebe o UUID do autor pelo frontend.</p>
        <div className="mt-4">
          <p>Confirmar também:</p>
          <ul className="list-disc pl-5 mt-2">
            <li>SECURITY DEFINER;</li>
            <li>search_path fixo;</li>
            <li>validação de papel;</li>
            <li>bloqueio para papéis não autorizados;</li>
            <li>ausência de DELETE físico.</li>
          </ul>
        </div>
      </section>

      <section className="mb-6 border-t pt-6 bg-muted/30 p-4 rounded border">
        <h2 className="text-xl font-semibold mb-4 text-primary">ETAPA 3 — HOMOLOGAR O CASO REAL</h2>
        <p className="font-bold">Executar no ambiente publicado o caso:</p>
        <div className="my-4 bg-background p-4 rounded border">
          <p>HELLEN ROCHA DE SOUSA</p>
          <p>Matrícula: 98</p>
          <p>Empresa: CZB</p>
          <p>Projeto: ADMINISTRATIVO 61</p>
        </div>
        <div className="mb-4">
          <p className="font-bold">Motivo:</p>
          <p>Lançamento sem fundamento</p>
          <p className="font-bold mt-2">Justificativa:</p>
          <p>COLABORADORA NÃO TEM FALTAS E ATESTADOS</p>
        </div>
        <div>
          <p className="font-bold">Fluxo:</p>
          <ol className="list-decimal pl-5 mt-2 space-y-1">
            <li>Abrir Ausências.</li>
            <li>Abrir menu.</li>
            <li>Clicar Excluir lançamento.</li>
            <li>Selecionar categoria.</li>
            <li>Informar justificativa.</li>
            <li>Marcar confirmação.</li>
            <li>Confirmar exclusão.</li>
          </ol>
        </div>
      </section>

      <section className="mb-6 border-t pt-6">
        <h2 className="text-xl font-semibold mb-4">RESULTADO ESPERADO</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>nenhum erro de coluna inexistente;</li>
          <li>toast de sucesso;</li>
          <li>status_documental = EXCLUIDO;</li>
          <li>excluida_em preenchido;</li>
          <li>excluida_por_usuario_id preenchido;</li>
          <li>motivo persistido;</li>
          <li>registro permanece fisicamente em public.ausencias;</li>
          <li>processamento deixa de considerar o registro;</li>
          <li>indicadores deixam de contar o registro;</li>
          <li>auditoria registra AUSENCIA_EXCLUIDA;</li>
          <li>notificações são enfileiradas.</li>
        </ul>
      </section>

      <section className="mb-6 border-t pt-6">
        <h2 className="text-xl font-semibold mb-4 text-primary">ETAPA 4 — VALIDAR AUTORIA</h2>
        <p className="mb-2">Apresentar:</p>
        <ul className="list-disc pl-5 space-y-1 grid grid-cols-2">
          <li>UUID de quem excluiu;</li>
          <li>nome snapshot;</li>
          <li>papel snapshot;</li>
          <li>data e hora;</li>
          <li>motivo;</li>
          <li>categoria;</li>
          <li>protocolo.</li>
        </ul>
        <p className="mt-4 italic">Confirmar que a autoria vem do servidor via auth.uid().</p>
      </section>

      <section className="mb-6 border-t pt-6">
        <h2 className="text-xl font-semibold mb-4 text-primary">ETAPA 5 — VALIDAR LISTAGEM</h2>
        <p>Depois da exclusão:</p>
        <div className="mt-4 space-y-4">
          <div>
            <p className="font-bold italic underline">Filtro: Ativos</p>
            <p>→ o registro não deve aparecer.</p>
          </div>
          <div>
            <p className="font-bold italic underline">Filtro: Excluídos</p>
            <p>→ o registro deve aparecer.</p>
          </div>
          <div>
            <p className="font-bold italic underline">Filtro: Todos</p>
            <p>→ deve aparecer com badge EXCLUÍDO.</p>
          </div>
        </div>
      </section>

      <section className="mb-6 border-t pt-6">
        <h2 className="text-xl font-semibold mb-4 text-primary">ETAPA 6 — VALIDAR PAINEL 360º</h2>
        <p>Abrir o registro excluído e confirmar:</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>banner de registro excluído;</li>
          <li>ausência sem efeitos operacionais;</li>
          <li>autor da exclusão;</li>
          <li>papel;</li>
          <li>data/hora;</li>
          <li>motivo;</li>
          <li>timeline preservada;</li>
          <li>eventos anteriores mantidos.</li>
        </ul>
      </section>

      <section className="mb-6 border-t pt-6">
        <h2 className="text-xl font-semibold mb-4 text-primary">ETAPA 7 — VALIDAR INDICADORES</h2>
        <div className="space-y-4">
          <div>
            <p className="font-bold">Confirmar que o registro excluído não conta em:</p>
            <ul className="list-disc pl-5 grid grid-cols-2 mt-1">
              <li>Dashboard;</li>
              <li>BI Executivo;</li>
              <li>pendentes;</li>
              <li>lançados;</li>
              <li>backlog;</li>
              <li>Central de Processamento;</li>
              <li>rankings;</li>
              <li>relatórios operacionais;</li>
              <li>exportações padrão.</li>
            </ul>
          </div>
          <div>
            <p className="font-bold">Confirmar que permanece em:</p>
            <ul className="list-disc pl-5 mt-1">
              <li>Auditoria;</li>
              <li>Auditoria Forense;</li>
              <li>Histórico;</li>
              <li>Central de Investigações;</li>
              <li>filtro de Excluídos.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mb-6 border-t pt-6 text-primary">
        <h2 className="text-xl font-semibold mb-4">ETAPA 8 — VALIDAR NOTIFICAÇÕES</h2>
        <p>Confirmar criação do evento para:</p>
        <ul className="list-disc pl-5 mt-1">
          <li>colaborador;</li>
          <li>supervisor;</li>
          <li>coordenador, quando aplicável;</li>
          <li>RH.</li>
        </ul>
        <p className="mt-4 font-bold text-destructive underline">A notificação não deve conter:</p>
        <ul className="list-disc pl-5 mt-1 text-destructive">
          <li>CID;</li>
          <li>diagnóstico;</li>
          <li>observações médicas;</li>
          <li>documentos;</li>
          <li>dados sensíveis.</li>
        </ul>
        <p className="mt-4 italic">Falha do provedor não pode desfazer a exclusão.</p>
      </section>

      <section className="mb-6 border-t pt-6">
        <h2 className="text-xl font-semibold mb-4 text-primary">ETAPA 9 — TESTE DE DUPLA EXCLUSÃO</h2>
        <p>Tentar excluir novamente o mesmo registro.</p>
        <p className="mt-2 font-bold">Resultado esperado:</p>
        <ul className="list-disc pl-5 mt-1">
          <li>operação bloqueada;</li>
          <li>mensagem amigável;</li>
          <li>nenhuma nova alteração;</li>
          <li>nenhuma notificação duplicada;</li>
          <li>nenhuma nova auditoria indevida.</li>
        </ul>
      </section>

      <section className="mb-6 border-t pt-6">
        <h2 className="text-xl font-semibold mb-4 text-primary">ETAPA 10 — TESTE DE PERMISSÕES</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="border p-3 rounded bg-green-50/10 border-green-500/50">
            <p className="font-bold text-green-600">SUPER ADMIN:</p>
            <p>- pode excluir.</p>
          </div>
          <div className="border p-3 rounded bg-green-50/10 border-green-500/50">
            <p className="font-bold text-green-600">RH:</p>
            <p>- pode excluir.</p>
          </div>
          <div className="border p-3 rounded bg-red-50/10 border-red-500/50">
            <p className="font-bold text-red-600">SUPERVISOR:</p>
            <p>- não vê a opção;</p>
            <p>- chamada direta é bloqueada.</p>
          </div>
          <div className="border p-3 rounded bg-red-50/10 border-red-500/50">
            <p className="font-bold text-red-600">COORDENADOR:</p>
            <p>- não vê a opção;</p>
            <p>- chamada direta é bloqueada.</p>
          </div>
        </div>
      </section>

      <section className="mb-6 border-t pt-6">
        <h2 className="text-xl font-semibold mb-4 text-primary">ETAPA 11 — REGRESSÃO</h2>
        <p className="mb-2">Validar que continuam funcionando:</p>
        <ol className="list-decimal pl-5 grid grid-cols-2 gap-1 text-sm">
          <li>Login.</li>
          <li>Nova Ausência.</li>
          <li>Lançamento manual.</li>
          <li>Lançamento automático.</li>
          <li>Editar.</li>
          <li>Retificar.</li>
          <li>Marcar como lançado.</li>
          <li>Processamento Interno.</li>
          <li>Painel 360º.</li>
          <li>Dashboard.</li>
          <li>BI Executivo.</li>
          <li>Notificações.</li>
          <li>Auditoria.</li>
          <li>Contestações.</li>
          <li>Busca por matrícula.</li>
          <li>Anexos.</li>
          <li>Exportações.</li>
          <li>RBAC.</li>
          <li>RLS.</li>
          <li>Typecheck.</li>
          <li>Suíte completa.</li>
        </ol>
      </section>

      <section className="mb-6 border-t pt-6 bg-destructive/10 p-4 rounded border-destructive/20">
        <h2 className="text-xl font-semibold mb-4 text-destructive">NÃO FAÇA</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Não criar nova coluna sem necessidade.</li>
          <li>Não alterar novamente a RPC.</li>
          <li>Não executar DELETE físico.</li>
          <li>Não apagar anexos.</li>
          <li>Não apagar auditoria.</li>
          <li>Não alterar módulos não relacionados.</li>
          <li>Não declarar “homologado” sem evidência real.</li>
          <li>Não responder apenas “corrigido”.</li>
        </ul>
      </section>

      <section className="mb-6 border-t pt-6 bg-green-50/10 p-4 rounded border-green-500/20">
        <h2 className="text-xl font-semibold mb-4 text-green-600">CRITÉRIOS DE ACEITE</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Exclusão funciona no ambiente publicado.</li>
          <li>Registro permanece no banco.</li>
          <li>Registro deixa de ter efeito operacional.</li>
          <li>Autoria fica registrada.</li>
          <li>Auditoria permanece íntegra.</li>
          <li>Notificações funcionam.</li>
          <li>Indicadores ignoram o registro.</li>
          <li>RH e Super Admin conseguem excluir.</li>
          <li>Supervisor e Coordenador permanecem bloqueados.</li>
          <li>Nenhuma regressão ocorre.</li>
        </ul>
      </section>

      <section className="mb-6 border-t pt-6 bg-primary/10 p-6 rounded border-primary/20">
        <h2 className="text-xl font-bold mb-4 text-primary">AO FINAL, APRESENTAR</h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>schema confirmado;</li>
          <li>definição final da RPC;</li>
          <li>UUID da ausência excluída;</li>
          <li>protocolo;</li>
          <li>status_documental final;</li>
          <li>excluida_em;</li>
          <li>excluida_por_usuario_id;</li>
          <li>nome e papel snapshot;</li>
          <li>evidência da auditoria;</li>
          <li>evidência das notificações;</li>
          <li>evidência de retirada dos indicadores;</li>
          <li>teste de dupla exclusão;</li>
          <li>teste de permissões;</li>
          <li>resultado da suíte de regressão;</li>
          <li>confirmação de que nenhum registro foi apagado fisicamente.</li>
        </ol>
      </section>

      <footer className="mt-8 pt-6 border-t text-sm text-muted-foreground italic text-center">
        A UI e a identidade visual devem permanecer bonitas, harmônicas, intuitivas, modernas e consistentes com o Design System do CRM MK9.
      </footer>
    </div>
  );
}
