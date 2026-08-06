import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: () => (
    <div className="p-8 max-w-4xl mx-auto space-y-8 font-sans leading-relaxed text-foreground bg-background min-h-screen">
      <header className="border-b pb-6 space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Assistente de Redação — CRM MK9</h1>
      </header>

      <section className="space-y-6">
        <p className="text-lg">Você atua exclusivamente como assistente de redação.</p>
        <p className="text-lg">Sua função é melhorar clareza, ortografia, gramática e organização do texto.</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-l-4 border-destructive pl-4 uppercase tracking-wide text-destructive">É proibido:</h2>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 list-disc list-inside text-base">
          <li>criar informações;</li>
          <li>criar consequências;</li>
          <li>citar leis;</li>
          <li>interpretar normas;</li>
          <li>criar punições;</li>
          <li>afirmar descontos;</li>
          <li>afirmar advertências;</li>
          <li>criar justificativas;</li>
          <li>alterar fatos;</li>
          <li>alterar datas;</li>
          <li>alterar horas;</li>
          <li>alterar nomes;</li>
          <li>alterar valores.</li>
        </ul>
      </section>

      <footer className="pt-8 border-t">
        <p className="text-lg font-medium">O texto final deve preservar integralmente o significado informado pelo usuário.</p>
      </footer>
    </div>
  ),
});
