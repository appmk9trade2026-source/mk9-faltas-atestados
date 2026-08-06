import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: () => (
    <div className="p-8 max-w-5xl mx-auto space-y-8 font-sans leading-relaxed text-foreground bg-background min-h-screen">
      <header className="border-b-2 border-primary pb-6 space-y-4">
        <h1 className="text-3xl font-black tracking-tighter uppercase text-primary">CRM MK9 — CORREÇÃO DEFINITIVA DO ENUM tipo_ausencia NO LANÇAMENTO MANUAL</h1>
        <div className="flex flex-wrap gap-4 items-center">
          <div className="bg-muted px-4 py-2 rounded-md border">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">PROJECT REF</p>
            <p className="text-sm font-mono font-bold text-primary">wgozydjiuimxxddhodax</p>
          </div>
          <div className="bg-destructive/10 px-4 py-2 rounded-md border border-destructive/30 animate-pulse">
            <p className="text-[10px] font-bold text-destructive uppercase tracking-wider underline decoration-2 underline-offset-2">ERRO CONFIRMADO NO AMBIENTE PUBLICADO</p>
            <p className="text-xs font-medium text-destructive mt-1 italic">column "tipo" is of type tipo_ausencia but expression is of type text</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Left Column: Objectives & Constraints */}
        <div className="md:col-span-4 space-y-6">
          <section className="bg-card border rounded-xl p-5 shadow-sm space-y-3">
            <h2 className="text-lg font-bold flex items-center gap-2 border-b pb-2 text-primary uppercase tracking-tight">
              <span className="w-2 h-6 bg-primary rounded-full"></span>
              OBJETIVO
            </h2>
            <p className="text-sm font-medium leading-relaxed">
              Identificar a função exata executada no ambiente publicado e corrigir somente a incompatibilidade entre o parâmetro recebido e a coluna <code className="bg-muted px-1 rounded text-primary font-bold italic">public.ausencias.tipo</code>.
            </p>
          </section>

          <section className="bg-destructive/5 border border-destructive/20 rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2 border-b border-destructive/20 pb-2 text-destructive uppercase tracking-tight">
              <span className="w-2 h-6 bg-destructive rounded-full"></span>
              DIRETRIZ CRÍTICA
            </h2>
            <ul className="space-y-2 text-xs font-bold text-destructive/80 list-none">
              <li className="flex items-start gap-2">
                <span className="mt-1">●</span>
                <span>Não alterar o ENUM <code className="bg-destructive/10 px-1 rounded">tipo_ausencia</code>.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1">●</span>
                <span>Não converter a coluna tipo para text.</span>
              </li>
              <li className="flex items-start gap-2 border-t border-destructive/10 pt-2 text-muted-foreground font-medium italic">
                <span>Preservar integralmente RLS, RBAC, Auditoria e Processamentos.</span>
              </li>
            </ul>
          </section>

          <section className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5 shadow-sm space-y-3">
            <h2 className="text-lg font-bold flex items-center gap-2 border-b border-amber-500/20 pb-2 text-amber-600 uppercase tracking-tight">
              <span className="w-2 h-6 bg-amber-500 rounded-full"></span>
              ENUM REAL
            </h2>
            <p className="text-[10px] text-muted-foreground uppercase font-bold italic mb-1">Valores verificados no banco:</p>
            <div className="flex flex-wrap gap-2 font-mono text-[10px]">
              <span className="px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded font-bold text-amber-700 uppercase">FALTA</span>
              <span className="px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded font-bold text-amber-700 uppercase">ATESTADO</span>
              <span className="px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded font-bold text-amber-700 uppercase">OUTROS</span>
            </div>
          </section>
        </div>

        {/* Right Column: Steps & Technical Info */}
        <div className="md:col-span-8 space-y-6">
          <section className="bg-card border rounded-xl p-6 shadow-md space-y-6">
            <h2 className="text-xl font-black flex items-center gap-3 border-b-2 pb-3 text-primary uppercase tracking-tighter italic">
              ROTEIRO TÉCNICO DE CORREÇÃO
            </h2>
            
            <div className="grid gap-6">
              <div className="border-l-4 border-primary pl-4 py-1">
                <h3 className="text-sm font-black uppercase text-primary tracking-widest flex justify-between items-center">
                  ETAPA 1 — IDENTIFICAÇÃO REAL
                </h3>
                <p className="text-xs mt-2 leading-relaxed text-muted-foreground font-medium">
                  Mapear a chamada oficial no frontend/server: registrar em desenvolvimento o nome da RPC, payload e resposta completa do Supabase.
                </p>
                <div className="mt-2 text-[10px] font-mono bg-muted p-2 rounded border space-y-1">
                  <p className="text-primary font-bold italic underline">Suspeita Principal:</p>
                  <p>registrar_ausencia_com_colaborador_manual</p>
                </div>
              </div>

              <div className="border-l-4 border-primary pl-4 py-1">
                <h3 className="text-sm font-black uppercase text-primary tracking-widest">
                  ETAPA 3 — O INSERT QUE FALHA
                </h3>
                <p className="text-xs mt-2 leading-relaxed text-muted-foreground font-medium">
                  Localizar o comando exato que grava <code className="italic font-bold text-primary">public.ausencias.tipo</code> e demonstrar por que a expressão chega como text (payload JSON, variáveis sem cast, etc).
                </p>
              </div>

              <div className="border-l-4 border-green-500 pl-4 py-1 bg-green-500/5 rounded-r-lg">
                <h3 className="text-sm font-black uppercase text-green-600 tracking-widest flex items-center gap-2">
                  ETAPA 5 — CORREÇÃO CANÔNICA (ESTRATÉGIA)
                </h3>
                <div className="mt-2 space-y-3">
                  <p className="text-xs leading-relaxed text-muted-foreground font-medium">
                    Declarar o parâmetro da RPC como <code className="bg-green-100 text-green-800 px-1 rounded font-bold">p_tipo public.tipo_ausencia</code> ou realizar cast explícito com validação:
                  </p>
                  <pre className="text-[10px] bg-zinc-900 text-zinc-100 p-3 rounded-md overflow-x-auto border-2 border-green-500/30">
{`IF NOT EXISTS (
  SELECT 1 FROM unnest(enum_range(NULL::public.tipo_ausencia)) AS v
  WHERE v::text = p_tipo
) THEN
  RAISE EXCEPTION 'Tipo de ausência inválido';
END IF;

INSERT INTO public.ausencias (tipo) VALUES (p_tipo::public.tipo_ausencia);`}
                  </pre>
                </div>
              </div>

              <div className="border-l-4 border-primary pl-4 py-1">
                <h3 className="text-sm font-black uppercase text-primary tracking-widest">
                  ETAPA 10 — HOMOLOGAÇÃO EM PRODUÇÃO
                </h3>
                <p className="text-xs mt-2 leading-relaxed text-muted-foreground font-medium">
                  Teste real com <span className="font-bold text-primary uppercase">SUPERVISOR</span> no ambiente publicado (matrícula inexistente → ativa preenchimento manual → seleção de tipo válido → conclusão sem erros).
                </p>
              </div>
            </div>
          </section>

          <section className="bg-destructive/10 border-2 border-destructive/20 p-6 rounded-xl space-y-4">
            <h2 className="text-lg font-black text-destructive uppercase tracking-tighter flex items-center gap-2">
              <span className="p-1 bg-destructive text-white rounded font-mono text-xs">X</span>
              NÃO FAÇA
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
              {[
                "Não mudar a coluna para text.",
                "Não criar novo enum.",
                "Não alterar labels existentes.",
                "Não corrigir apenas o frontend.",
                "Não manter overload antigo.",
                "Não alterar módulos não relacionados."
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-xs font-bold text-destructive/80">
                  <div className="w-1.5 h-1.5 bg-destructive rounded-full"></div>
                  {item}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <section className="bg-primary/5 border border-primary/20 p-6 rounded-xl">
        <h2 className="text-xl font-black text-primary border-b-2 border-primary/20 pb-3 uppercase tracking-tighter italic">
          CRITÉRIOS DE ACEITE E ENTREGÁVEIS
        </h2>
        <div className="grid md:grid-cols-2 gap-8 mt-4">
          <ul className="space-y-2 text-xs font-bold">
            <li className="flex items-center gap-2 text-green-600">
              <span className="text-lg">✓</span> O erro de tipo desaparece definitivamente.
            </li>
            <li className="flex items-center gap-2 text-green-600">
              <span className="text-lg">✓</span> Supervisor e RH concluem lançamento manual.
            </li>
            <li className="flex items-center gap-2 text-green-600">
              <span className="text-lg">✓</span> Colaborador é cadastrado e vinculado à ausência.
            </li>
          </ul>
          <div className="bg-muted p-4 rounded-lg space-y-2 border">
            <p className="text-[10px] font-black uppercase text-muted-foreground underline decoration-primary decoration-2 underline-offset-4 mb-2">Apresentar ao final:</p>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-primary font-bold uppercase tracking-tight">
              <span>1. RPC Chamada</span>
              <span>2. Assinatura RPC</span>
              <span>3. Correção Aplicada</span>
              <span>4. Log de Teste Prod</span>
              <span>5. ID da Ausência</span>
              <span>6. ID Colaborador</span>
            </div>
          </div>
        </div>
      </section>

      <footer className="text-center pt-8 border-t-2 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
        Design System CRM MK9 — 2026 • Tecnologia, Auditoria e Governança
      </footer>
    </div>
  ),
});