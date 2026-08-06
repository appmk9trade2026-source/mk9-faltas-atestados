import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: () => (
    <div className="p-8 max-w-4xl mx-auto space-y-8 font-sans leading-relaxed text-foreground bg-background min-h-screen">
      <header className="border-b pb-6 space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">CRM MK9 — CORRIGIR O COMPORTAMENTO DA FUNÇÃO "MELHORAR COM IA"</h1>
        <div className="bg-muted p-4 rounded-md">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">PROJECT REF</p>
          <p className="text-lg font-mono">wgozydjiuimxxddhodax</p>
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-l-4 border-destructive pl-4 uppercase tracking-wide">PROBLEMA</h2>
        <p>A funcionalidade "Melhorar com IA" está extrapolando o papel de revisão textual.</p>
        <div className="bg-destructive/10 p-4 rounded-md border border-destructive/20 text-sm space-y-2">
          <p className="font-bold">Exemplo real:</p>
          <p><strong>Entrada:</strong> "Ausência de 3 horas e 20 minutos."</p>
          <p><strong>Saída da IA:</strong> "Conforme art. 58 da CLT, o período não trabalhado será descontado em folha de pagamento."</p>
          <p className="italic text-destructive font-medium">Essa informação NÃO foi fornecida pelo usuário e pode ser juridicamente incorreta para aquele caso.</p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-l-4 border-primary pl-4 uppercase tracking-wide">OBJETIVO</h2>
        <p>Transformar a IA em uma assistente exclusivamente de redação.</p>
        <p>Ela deve apenas:</p>
        <ul className="grid grid-cols-2 gap-2 text-sm ml-4 list-disc">
          <li>melhorar gramática;</li>
          <li>melhorar ortografia;</li>
          <li>melhorar clareza;</li>
          <li>melhorar organização;</li>
          <li>melhorar formalidade;</li>
          <li>padronizar linguagem.</li>
        </ul>
        <p className="font-bold">Nunca criar conteúdo novo.</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-l-4 border-destructive pl-4 uppercase tracking-wide">DIRETRIZES OBRIGATÓRIAS</h2>
        <p className="font-semibold text-destructive">A IA está proibida de:</p>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 list-disc list-inside text-sm text-muted-foreground">
          <li>citar CLT;</li>
          <li>citar legislação;</li>
          <li>citar normas internas;</li>
          <li>afirmar desconto salarial;</li>
          <li>afirmar advertências;</li>
          <li>afirmar punições;</li>
          <li>afirmar suspensão;</li>
          <li>afirmar justa causa;</li>
          <li>afirmar abandono;</li>
          <li>afirmar consequências administrativas;</li>
          <li>interpretar fatos;</li>
          <li>criar justificativas;</li>
          <li>inventar informações;</li>
          <li>alterar datas;</li>
          <li>alterar horários;</li>
          <li>alterar quantidade de horas;</li>
          <li>alterar nomes;</li>
          <li>alterar matrículas;</li>
          <li>alterar protocolos.</li>
        </ul>
        <p className="text-sm font-medium pt-2">A IA deve preservar 100% do conteúdo informado pelo usuário. Se o texto estiver muito curto, melhorar apenas a escrita. Nunca completar com informações presumidas.</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-l-4 border-primary pl-4 uppercase tracking-wide">IMPLEMENTAR TRÊS MODOS</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="p-4 border rounded-lg bg-card">
            <h3 className="font-bold mb-2">Modo 1</h3>
            <p className="text-sm font-semibold">Melhorar Texto</p>
            <p className="text-xs text-muted-foreground">Correção ortográfica e gramatical.</p>
          </div>
          <div className="p-4 border rounded-lg bg-card">
            <h3 className="font-bold mb-2">Modo 2</h3>
            <p className="text-sm font-semibold">Padronizar Comunicação</p>
            <p className="text-xs text-muted-foreground">Seguir o padrão corporativo do CRM MK9.</p>
          </div>
          <div className="p-4 border rounded-lg bg-card">
            <h3 className="font-bold mb-2">Modo 3</h3>
            <p className="text-sm font-semibold">Tornar Mais Formal</p>
            <p className="text-xs text-muted-foreground">Melhorar apenas o nível de formalidade.</p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-l-4 border-amber-500 pl-4 uppercase tracking-wide">VALIDAÇÃO</h2>
        <p className="text-sm">Executar testes utilizando textos reais.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="p-4 bg-muted/50 rounded-lg text-xs space-y-1 border">
            <p className="font-bold">Teste A:</p>
            <p><strong>Entrada:</strong> "Ausência de 3 horas e 20 minutos."</p>
            <p className="text-destructive">A saída NÃO pode conter: CLT; desconto; folha; advertência; punição.</p>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg text-xs space-y-1 border">
            <p className="font-bold">Teste B:</p>
            <p><strong>Entrada:</strong> "Funcionário faltou."</p>
            <p className="text-destructive">A saída NÃO pode acrescentar: falta injustificada; abandono; sanções.</p>
          </div>
        </div>
      </section>

      <section className="bg-destructive/10 p-6 rounded-lg border border-destructive/20 space-y-4">
        <h2 className="text-lg font-bold text-destructive">NÃO FAÇA</h2>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 list-disc list-inside text-sm text-destructive/80">
          <li>Não gerar interpretações jurídicas.</li>
          <li>Não inventar consequências.</li>
          <li>Não acrescentar leis.</li>
          <li>Não alterar o sentido do texto.</li>
          <li>Não modificar dados informados.</li>
          <li>Não criar informações não fornecidas.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-l-4 border-green-500 pl-4 uppercase tracking-wide">CRITÉRIOS DE ACEITE</h2>
        <ul className="grid grid-cols-1 gap-2 text-sm ml-4">
          <li className="flex items-center gap-2"><span className="text-green-500 font-bold">✓</span> A IA atua exclusivamente como revisora de texto.</li>
          <li className="flex items-center gap-2"><span className="text-green-500 font-bold">✓</span> Todo o significado original é preservado.</li>
          <li className="flex items-center gap-2"><span className="text-green-500 font-bold">✓</span> Nenhuma informação jurídica ou administrativa é adicionada sem ter sido escrita pelo usuário.</li>
        </ul>
      </section>

      <footer className="text-center pt-8 border-t text-sm space-y-4">
        <p className="font-bold uppercase tracking-widest text-muted-foreground">Ao final apresentar:</p>
        <div className="flex flex-wrap justify-center gap-4 text-xs font-mono">
          <span className="p-2 bg-muted rounded">1. Prompt atualizado</span>
          <span className="p-2 bg-muted rounded">2. Regras de segurança</span>
          <span className="p-2 bg-muted rounded">3. Casos de teste</span>
          <span className="p-2 bg-muted rounded">4. Exemplos Antes/Depois</span>
        </div>
      </footer>
    </div>
  ),
});
