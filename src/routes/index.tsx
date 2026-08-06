import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen bg-background p-8 flex flex-col items-center justify-center text-center space-y-6">
      <div className="max-w-2xl space-y-4">
        <h1 className="text-4xl font-bold tracking-tight text-[#009CDE]">
          CRM MK9 — Sistema de Gestão de Faltas e Atestados
        </h1>
        <p className="text-xl text-muted-foreground">
          Portal de Homologação e Auditoria Forense Avançada
        </p>
        <div className="p-6 bg-card border rounded-xl shadow-sm space-y-4 text-left">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Estado da Auditoria Forense (Fase 2)
          </h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">✓ Hash Determinístico (SHA-256)</li>
            <li className="flex items-center gap-2">✓ Cadeia de Custódia Imutável</li>
            <li className="flex items-center gap-2">✓ Metadados de Origem (IP/UA)</li>
            <li className="flex items-center gap-2">✓ Auditoria por Campo (Field-Audit)</li>
            <li className="flex items-center gap-2">✓ Serialização Canônica (RFC 8785)</li>
            <li className="flex items-center gap-2">✓ Suíte de Testes Automatizada</li>
          </ul>
        </div>
        <div className="pt-4">
          <a
            href="/auth"
            className="inline-flex items-center justify-center rounded-md bg-[#009CDE] px-8 py-3 text-sm font-medium text-white shadow transition-colors hover:bg-[#007cb0] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            Acessar Sistema
          </a>
        </div>
      </div>
      <footer className="fixed bottom-4 text-xs text-muted-foreground">
        SIGEC MK9 &copy; 2026 — Segurança e Integridade Garantidas
      </footer>
    </div>
  );
}
