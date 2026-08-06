import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: () => (
    <div className="p-8 max-w-4xl mx-auto space-y-8 font-sans leading-relaxed text-foreground bg-background min-h-screen">
      <header className="border-b pb-6 space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">CRM MK9 — HOMOLOGAÇÃO FINAL DA EXCLUSÃO LÓGICA DE AUSÊNCIAS</h1>
        <div className="bg-muted p-4 rounded-md">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">PROJECT REF</p>
          <p className="text-lg font-mono">wgozydjiuimxxddhodax</p>
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-l-4 border-primary pl-4 uppercase tracking-wide">CONTEXTO</h2>
        <p>A função <code>public.excluir_ausencia_segura</code> foi restaurada no banco com a assinatura canônica exigida pelo frontend:</p>
        <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm font-mono">
{`public.excluir_ausencia_segura(
  p_ausencia_id uuid,
  p_categoria_motivo text,
  p_motivo text
)`}
        </pre>
        <p>O cache de schema também foi atualizado.</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-l-4 border-primary pl-4 uppercase tracking-wide">OBJETIVO</h2>
        <p>Homologar o fluxo completo de exclusão lógica no ambiente publicado, confirmando que frontend, RPC, auditoria, notificações, processamento e indicadores estão funcionando de forma integrada.</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-l-4 border-destructive pl-4 uppercase tracking-wide">DIRETRIZ CRÍTICA</h2>
        <p className="font-semibold text-destructive">Não alterar novamente:</p>
        <ul className="list-disc list-inside space-y-1 ml-4 text-muted-foreground">
          <li>assinatura da RPC;</li>
          <li>interface do diálogo;</li>
          <li>autenticação;</li>
          <li>RBAC;</li>
          <li>RLS;</li>
          <li>Dashboard;</li>
          <li>BI Executivo;</li>
          <li>Processamento Interno;</li>
          <li>Painel 360º;</li>
          <li>notificações;</li>
          <li>auditoria;</li>
          <li>filtros;</li>
          <li>exportações;</li>
          <li>protocolos.</li>
        </ul>
        <p>Não aplicar novas migrations sem necessidade comprovada.</p>
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section className="space-y-4 p-6 border rounded-lg bg-card text-card-foreground shadow-sm">
          <h2 className="text-lg font-bold border-b pb-2">ETAPA 1 — VALIDAR A RPC NO BANCO</h2>
          <p className="text-sm font-semibold">Confirmar em pg_proc:</p>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
            <li>schema = public;</li>
            <li>nome = excluir_ausencia_segura;</li>
            <li>assinatura = uuid, text, text;</li>
            <li>retorno;</li>
            <li>owner;</li>
            <li>SECURITY DEFINER;</li>
            <li>search_path fixo;</li>
            <li>grants.</li>
          </ul>
          <p className="text-sm italic">Confirmar que não existem overloads ambíguos.</p>
        </section>

        <section className="space-y-4 p-6 border rounded-lg bg-card text-card-foreground shadow-sm">
          <h2 className="text-lg font-bold border-b pb-2">ETAPA 2 — VALIDAR GRANTS</h2>
          <p className="text-sm font-semibold">Confirmar:</p>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
            <li>PUBLIC sem EXECUTE;</li>
            <li>anon sem EXECUTE;</li>
            <li>authenticated com EXECUTE;</li>
            <li>service_role com EXECUTE, se necessário.</li>
          </ul>
          <p className="text-sm italic">A autorização interna deve continuar validando apenas: super_admin; rh.</p>
        </section>

        <section className="space-y-4 p-6 border rounded-lg bg-card text-card-foreground shadow-sm">
          <h2 className="text-lg font-bold border-b pb-2">ETAPA 3 — TESTAR COM SUPER ADMIN</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground ml-2">
            <li>abrir Ausências;</li>
            <li>abrir o menu de ações;</li>
            <li>clicar “Excluir lançamento”;</li>
            <li>preencher categoria;</li>
            <li>preencher motivo;</li>
            <li>marcar o checkbox;</li>
            <li>confirmar.</li>
          </ol>
          <div className="mt-4 p-3 bg-muted/50 rounded text-xs">
            <p className="font-bold mb-1">Resultado esperado:</p>
            <p>Sucesso, registro sai da ativa, status EXCLUIDO, metadados preenchidos, auditoria criada, notificações enfileiradas, indicadores atualizados.</p>
          </div>
        </section>

        <section className="space-y-4 p-6 border rounded-lg bg-card text-card-foreground shadow-sm">
          <h2 className="text-lg font-bold border-b pb-2">ETAPA 4 — TESTAR COM RH</h2>
          <p className="text-sm">Repetir o fluxo com usuário RH real.</p>
          <div className="mt-4 p-3 bg-muted/50 rounded text-xs">
            <p className="font-bold mb-1">Resultado esperado:</p>
            <p>Ação visível; exclusão lógica concluída; autoria correta; auditoria correta; nenhuma permissão ampliada.</p>
          </div>
        </section>

        <section className="space-y-4 p-6 border rounded-lg bg-card text-card-foreground shadow-sm">
          <h2 className="text-lg font-bold border-b pb-2">ETAPA 5 — TESTAR BLOQUEIO</h2>
          <p className="text-sm">Com Supervisor e Coordenador:</p>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
            <li>a opção não deve aparecer;</li>
            <li>chamada direta à RPC deve retornar acesso negado;</li>
            <li>nenhum dado deve ser alterado.</li>
          </ul>
        </section>

        <section className="space-y-4 p-6 border rounded-lg bg-card text-card-foreground shadow-sm">
          <h2 className="text-lg font-bold border-b pb-2">ETAPA 6 — VALIDAR REGISTRO EXCLUÍDO</h2>
          <p className="text-sm">Usar o filtro administrativo "Status Documental" (Ativos, Excluídos, Todos).</p>
          <p className="text-xs text-muted-foreground mt-2">Confirmar badge EXCLUÍDO, autoria, carimbo de tempo, justificativa, protocolo e estado anterior.</p>
        </section>

        <section className="space-y-4 p-6 border rounded-lg bg-card text-card-foreground shadow-sm">
          <h2 className="text-lg font-bold border-b pb-2">ETAPA 7 — VALIDAR PAINEL 360º</h2>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
            <li>banner “REGISTRO EXCLUÍDO”;</li>
            <li>ausência sem efeitos operacionais;</li>
            <li>detalhes da exclusão (quem, quando, porquê);</li>
            <li>evento AUSENCIA_EXCLUIDA na timeline.</li>
          </ul>
        </section>

        <section className="space-y-4 p-6 border rounded-lg bg-card text-card-foreground shadow-sm">
          <h2 className="text-lg font-bold border-b pb-2">ETAPA 8 — VALIDAR INDICADORES</h2>
          <p className="text-sm">Confirmar remoção de faltas, atestados e backlog operacional.</p>
          <p className="text-xs text-muted-foreground mt-2">Permanecer disponível apenas em Auditoria Forense e Central de Investigações.</p>
        </section>

        <section className="space-y-4 p-6 border rounded-lg bg-card text-card-foreground shadow-sm">
          <h2 className="text-lg font-bold border-b pb-2">ETAPA 9 — VALIDAR NOTIFICAÇÕES</h2>
          <p className="text-sm">Confirmar comunicações para colaborador, Supervisor e RH sem dados sensíveis (CID/diagnóstico).</p>
        </section>

        <section className="space-y-4 p-6 border rounded-lg bg-card text-card-foreground shadow-sm">
          <h2 className="text-lg font-bold border-b pb-2">ETAPA 10 — VALIDAR DUPLA EXCLUSÃO</h2>
          <p className="text-sm">Tentar excluir novamente o mesmo registro.</p>
          <p className="text-xs italic text-muted-foreground mt-2">Resultado esperado: “Este lançamento já foi excluído anteriormente.”</p>
        </section>
      </div>

      <section className="space-y-4 p-6 border-t">
        <h2 className="text-xl font-semibold uppercase tracking-wide">ETAPA 11 — TESTES DE REGRESSÃO</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          {["Login Admin/RH/Supervisor", "Nova Ausência", "Edição/Retificação", "Marcar Lançado", "Processamento Interno", "Painel 360º", "Dashboard/BI", "Notificações", "Cadastro Manual", "Busca Matrícula", "Exportações", "Auditoria/RLS/RBAC"].map(item => (
            <div key={item} className="p-2 bg-muted rounded flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="bg-destructive/10 p-6 rounded-lg border border-destructive/20 space-y-4">
        <h2 className="text-lg font-bold text-destructive">NÃO FAÇA</h2>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 list-disc list-inside text-sm text-destructive/80">
          <li>Não executar DELETE físico.</li>
          <li>Não recriar a RPC.</li>
          <li>Não alterar novamente os parâmetros.</li>
          <li>Não apagar anexos ou auditoria.</li>
          <li>Não ampliar permissões.</li>
          <li>Não alterar indicadores globais.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-l-4 border-green-500 pl-4 uppercase tracking-wide">CRITÉRIOS DE ACEITE</h2>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm ml-4">
          <li className="flex items-center gap-2"><span className="text-green-500">✓</span> RPC encontrada pela Data API</li>
          <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Super Admin e RH excluem logicamente</li>
          <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Supervisor e Coordenador bloqueados</li>
          <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Registro permanece no banco mas sai dos fluxos</li>
          <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Histórico íntegro e auditoria funcional</li>
          <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Nenhuma regressão detectada</li>
        </ul>
      </section>

      <footer className="text-center pt-12 text-sm text-muted-foreground italic border-t">
        A UI e a identidade visual devem permanecer bonitas, harmônicas, intuitivas, modernas e consistentes com o Design System do CRM MK9.
      </footer>
    </div>
  ),
});