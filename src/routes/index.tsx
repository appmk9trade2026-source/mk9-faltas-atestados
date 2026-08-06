import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: () => (
    <div className="p-8 max-w-4xl mx-auto space-y-8 font-sans leading-relaxed text-foreground bg-background min-h-screen">
      <header className="border-b pb-6 space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">
          CRM MK9 — REMOVER DOCUMENTAÇÃO DA HOME E VALIDAR A CHAVE CANÔNICA DO NOME
        </h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
          <span className="bg-muted px-2 py-1 rounded">PROJECT REF: wgozydjiuimxxddhodax</span>
        </div>
      </header>
      
      <section className="bg-destructive/5 border-l-4 border-destructive p-6 rounded-r-lg space-y-4">
        <h2 className="text-xl font-bold text-destructive uppercase tracking-wide flex items-center gap-2">
          Problema
        </h2>
        <div className="space-y-4 text-sm md:text-base">
          <p className="font-medium">Foi informado que:</p>
          <ol className="list-decimal pl-5 space-y-2">
            <li><code className="bg-muted px-1 rounded text-destructive font-mono">src/routes/index.tsx</code> voltou a receber documentação técnica.</li>
            <li>Foi adotada a chave <code className="bg-muted px-1 rounded text-destructive font-mono">manual_nome</code> no fluxo manual.</li>
          </ol>
          <p className="italic font-semibold text-destructive">Essas alterações precisam ser revisadas.</p>
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-8">
        <section className="space-y-4 bg-muted/30 p-6 rounded-lg border">
          <h2 className="text-lg font-bold border-b pb-2 uppercase tracking-wider text-primary">Objetivo</h2>
          <ul className="text-sm space-y-3 list-disc pl-5 font-medium">
            <li>Restaurar imediatamente a Home para o comportamento original.</li>
            <li>Descobrir qual é a chave canônica realmente utilizada em todo o fluxo.</li>
            <li>Não criar novas chaves de nome.</li>
            <li>Corrigir apenas o ponto de divergência.</li>
          </ul>
        </section>

        <section className="space-y-4 bg-muted/30 p-6 rounded-lg border">
          <h2 className="text-lg font-bold border-b pb-2 uppercase tracking-wider text-destructive">Não Alterar</h2>
          <ul className="grid grid-cols-2 gap-2 text-xs font-mono text-muted-foreground">
            <li>• autenticação</li>
            <li>• Dashboard</li>
            <li>• IA</li>
            <li>• enum tipo_ausencia</li>
            <li>• RPC homologadas</li>
            <li>• auditoria</li>
          </ul>
        </section>
      </div>

      <section className="space-y-6">
        <h2 className="text-xl font-bold border-b-2 pb-2 uppercase tracking-wide">Roteiro de Homologação</h2>
        <div className="grid gap-4">
          <div className="border rounded-xl p-5 bg-card shadow-sm hover:shadow-md transition-shadow">
            <h3 className="font-bold text-lg mb-2 text-primary flex items-center gap-2">
              <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
              Restaurar Home
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Restaurar <code className="bg-muted px-1 rounded font-mono">src/routes/index.tsx</code>. A Home não pode conter documentação, roteiro, checklist, SQL ou etapas técnicas.
            </p>
          </div>

          <div className="border rounded-xl p-5 bg-card shadow-sm hover:shadow-md transition-shadow">
            <h3 className="font-bold text-lg mb-2 text-primary flex items-center gap-2">
              <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
              Mapear Ocorrências
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              Mapear TODAS as ocorrências relacionadas ao nome do colaborador e informar onde cada uma é usada:
            </p>
            <div className="flex flex-wrap gap-2">
              {["nome", "nome_completo", "manual_nome", "nomeCompleto", "colaborador_nome"].map(key => (
                <span key={key} className="bg-muted px-2 py-0.5 rounded text-xs font-mono">{key}</span>
              ))}
            </div>
          </div>

          <div className="border rounded-xl p-5 bg-card shadow-sm hover:shadow-md transition-shadow">
            <h3 className="font-bold text-lg mb-2 text-primary flex items-center gap-2">
              <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-xs">3</span>
              Mapear Camadas
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Mostrar exatamente qual chave cada camada utiliza: Input, React Hook Form, Schema Zod, Payload, Server Function, RPC e Banco.
            </p>
          </div>

          <div className="border rounded-xl p-5 bg-card shadow-sm hover:shadow-md transition-shadow">
            <h3 className="font-bold text-lg mb-2 text-primary flex items-center gap-2">
              <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-xs">4</span>
              Padronização Canônica
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Se existir mais de uma chave para o mesmo dado, padronizar utilizando a chave que já é esperada pelo backend. Não criar aliases. Não manter duas representações do mesmo campo.
            </p>
          </div>

          <div className="border rounded-xl p-5 bg-card shadow-sm hover:shadow-md transition-shadow">
            <h3 className="font-bold text-lg mb-2 text-primary flex items-center gap-2">
              <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-xs">5</span>
              Lançamento Manual Completo
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Executar um lançamento manual completo. Apresentar: valor digitado, valor no Hook Form, valor validado, payload enviado, payload recebido e valor persistido. Todos devem ser idênticos.
            </p>
          </div>
          
          <div className="border rounded-xl p-5 bg-card shadow-sm hover:shadow-md transition-shadow">
            <h3 className="font-bold text-lg mb-2 text-primary flex items-center gap-2">
              <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-xs">6</span>
              Regressão Completa
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Validar: lançamento automático/manual, edição, retificação, exclusão lógica, Painel 360, notificações e processamento.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-primary/5 border border-primary/20 p-6 rounded-lg space-y-4">
        <h2 className="text-lg font-bold uppercase tracking-wider text-primary">Critério de Aceite</h2>
        <p className="text-sm font-medium">
          O mesmo valor digitado pelo usuário deve percorrer todo o fluxo até o banco sem troca de chave ou perda de estado.
        </p>
        <div className="text-xs text-muted-foreground italic space-y-1">
          <p>Ao final apresentar:</p>
          <ul className="list-disc pl-4">
            <li>chave canônica adotada</li>
            <li>arquivos alterados</li>
            <li>motivo da divergência</li>
            <li>evidência do lançamento manual funcionando</li>
          </ul>
        </div>
      </section>

      <footer className="pt-8 border-t text-center text-xs text-muted-foreground italic">
        O relatório deve ser técnico, auditável e reproduzível.
      </footer>
    </div>
  ),
});
