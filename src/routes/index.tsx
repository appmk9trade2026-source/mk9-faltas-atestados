import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: () => (
    <div className="p-8 max-w-3xl mx-auto space-y-6 font-sans leading-relaxed text-foreground bg-background min-h-screen">
      <header className="border-b pb-4 space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">
          CRM MK9 — CORRIGIR VALIDAÇÃO FALSA DO NOME NO LANÇAMENTO MANUAL
        </h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-mono bg-muted px-2 py-0.5 rounded">PROJECT REF: wgozydjiuimxxddhodax</span>
        </div>
      </header>
      
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-destructive uppercase tracking-wider">Problema Confirmado</h2>
        <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-md space-y-3">
          <p>No fluxo de lançamento manual de ausência, o formulário exibe corretamente:</p>
          <div className="bg-background p-2 rounded border font-mono text-sm">
            Nome Completo: GUSTAVO WILLIAM FERREIRA
          </div>
          <p>Porém, ao concluir, o sistema retorna:</p>
          <div className="bg-destructive/20 p-2 rounded border border-destructive/30 text-destructive font-bold italic">
            “Os dados enviados são inválidos. Informe o nome completo do colaborador (mínimo 3 caracteres).”
          </div>
          <p className="text-sm">O campo está visualmente preenchido, mas o valor recebido pela validação está vazio, incorreto ou associado a outra chave.</p>
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-8">
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2 uppercase tracking-wider">Objetivo</h2>
          <p className="text-sm">Identificar a divergência entre o valor visível, o estado do formulário, o schema de validação e o payload enviado ao backend.</p>
          <p className="text-sm font-medium">Corrigir somente esse fluxo, preservando todos os módulos homologados.</p>
          
          <div className="pt-4 space-y-3">
            <h3 className="text-sm font-bold text-destructive uppercase">Diretriz Crítica — Não Alterar o que Já Funciona</h3>
            <ul className="text-xs space-y-1 list-disc pl-4 text-muted-foreground">
              <li>RPC registrar_ausencia_com_colaborador_manual</li>
              <li>enum tipo_ausencia; autenticação; RBAC; RLS</li>
              <li>Dashboard; BI Executivo; Painel 360º</li>
              <li>Processamento Interno; Auditoria; Exclusão Lógica</li>
              <li>Notificações; Fluxo Automático; src/routes/index.tsx</li>
              <li>Melhorar com IA</li>
            </ul>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2 uppercase tracking-wider text-primary">Critérios de Aceite</h2>
          <ul className="space-y-2">
            {[
              "O valor exibido é o mesmo valor validado",
              "O valor validado é o mesmo enviado ao backend",
              "Nome válido não gera erro",
              "Nome inválido continua bloqueado",
              "O lançamento manual é concluído",
              "Fluxo automático permanece intacto",
              "Nenhuma regressão ocorre"
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="space-y-4 pt-4">
        <h2 className="text-lg font-semibold border-b pb-2 uppercase tracking-wider">Roteiro de Execução (Etapas 1-10)</h2>
        <div className="grid gap-4 text-sm">
          <div className="border rounded-lg p-4 space-y-2">
            <h3 className="font-bold">ETAPA 1 — Reproduzir e Capturar</h3>
            <p className="text-xs text-muted-foreground">Matrícula 2727, Nome: GUSTAVO WILLIAM FERREIRA. Registrar payload, form state e validação lado a lado.</p>
          </div>
          <div className="border rounded-lg p-4 space-y-2">
            <h3 className="font-bold">ETAPA 2 — Mapear Chaves (nome_completo)</h3>
            <p className="text-xs text-muted-foreground">Auditar chaves conflitantes (nome, manual_nome, etc). Adotar chave canônica homologada pelo schema.</p>
          </div>
          <div className="border rounded-lg p-4 space-y-2">
            <h3 className="font-bold">ETAPA 3 — Auditar Componente e Hook Form</h3>
            <p className="text-xs text-muted-foreground">Confirmar ligação correta via FormField/Controller. Garantir que valor exibido = valor submetido.</p>
          </div>
          <div className="border rounded-lg p-4 space-y-2">
            <h3 className="font-bold">ETAPA 4 — Auditar setValue no Modo Manual</h3>
            <p className="text-xs text-muted-foreground">Usar shouldValidate: true e shouldDirty: true ao preencher o nome via código.</p>
          </div>
          <div className="border rounded-lg p-4 space-y-2">
            <h3 className="font-bold">ETAPA 5 — Normalização e Trim</h3>
            <p className="text-xs text-muted-foreground">Aplicar trim() antes da validação. Não limpar campo indevidamente ao trocar empresa/projeto.</p>
          </div>
        </div>
      </section>

      <footer className="pt-8 border-t text-center text-xs text-muted-foreground italic">
        O relatório final deve apresentar evidências técnicas, IDs criados e comprovação de integridade dos módulos homologados.
      </footer>
    </div>
  ),
});
