import { createFileRoute } from '@tanstack/react-router';
import { 
  ClipboardCheck, 
  CheckCircle2, 
  AlertCircle, 
  Activity, 
  ChevronRight, 
  FileText, 
  UserPlus, 
  Zap, 
  Database,
  Search,
  ArrowRightLeft,
  ShieldCheck
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export const Route = createFileRoute('/')({
  component: HomologacaoLancamentoManualPage,
});

function HomologacaoLancamentoManualPage() {
  const steps = [
    { id: 1, title: "Validar Definição no Banco", status: "complete", progress: 100 },
    { id: 2, title: "Teste Supervisor Real (FALTA)", status: "pending", progress: 0 },
    { id: 3, title: "Teste com Atestado", status: "pending", progress: 0 },
    { id: 4, title: "Todos os Valores Válidos", status: "pending", progress: 0 },
    { id: 5, title: "Teste Valor Inválido", status: "pending", progress: 0 },
    { id: 6, title: "Reutilização do Colaborador", status: "pending", progress: 0 },
    { id: 7, title: "Teste Zeros à Esquerda", status: "pending", progress: 0 },
    { id: 8, title: "Teste de Escopo (RBAC)", status: "pending", progress: 0 },
    { id: 9, title: "Validar Transacionalidade", status: "pending", progress: 0 },
    { id: 10, title: "Regressão Geral", status: "pending", progress: 0 },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 md:p-12 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-primary font-bold uppercase tracking-widest text-sm">
              <ClipboardCheck className="w-4 h-4" />
              Homologação Final — Lançamento Manual
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 dark:text-white uppercase italic">
              Governança de <span className="text-primary underline decoration-primary/30">Lançamentos</span>
            </h1>
            <p className="text-slate-500 font-medium max-w-2xl">
              Validação final do fluxo manual após correção crítica de tipagem no enum <code className="text-primary font-mono bg-primary/5 px-1 rounded">tipo_ausencia</code>.
            </p>
          </div>
          
          <div className="flex items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border shadow-sm">
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Project Ref</p>
              <p className="text-sm font-mono font-bold text-primary tracking-tight">wgozydjiuimxxddhodax</p>
            </div>
            <Separator orientation="vertical" className="h-8" />
            <div className="flex flex-col items-center">
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-200 font-bold">
                EM HOMOLOGAÇÃO
              </Badge>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-8 space-y-8">
            {/* Contexto Section */}
            <section className="bg-white dark:bg-slate-900 rounded-3xl border shadow-lg overflow-hidden">
              <div className="bg-slate-900 p-6 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Database className="w-6 h-6 text-blue-400" />
                  <h2 className="text-xl font-bold uppercase tracking-tight">Contexto Técnico</h2>
                </div>
                <Badge className="bg-blue-500 text-white uppercase font-black tracking-widest px-3">
                  Fix Applied
                </Badge>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase">Causa Corrigida</p>
                    <p className="text-xs font-mono leading-relaxed">
                      _ausencia-&gt;&gt;'tipo' era <span className="text-red-500">text</span> e estava sendo inserido na coluna <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">public.ausencias.tipo</code> do tipo <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded text-primary">tipo_ausencia</code>.
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-green-500/5 dark:bg-green-500/10 border border-green-200/50 space-y-2">
                    <p className="text-[10px] font-black text-green-600 uppercase">Correção Aplicada</p>
                    <p className="text-xs font-mono leading-relaxed text-green-700 dark:text-green-400">
                      v_tipo public.tipo_ausencia;<br />
                      v_tipo := (_ausencia-&gt;&gt;'tipo')::public.tipo_ausencia;<br />
                      O INSERT agora utiliza v_tipo.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Valores Válidos do Enum</h4>
                  <div className="flex flex-wrap gap-2">
                    {['FALTA', 'ATESTADO', 'DECLARACAO', 'SUSPENSAO', 'OUTROS'].map(v => (
                      <Badge key={v} variant="secondary" className="font-mono text-[10px]">{v}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Roadmap */}
            <section className="space-y-4">
              <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3 text-slate-800 dark:text-white">
                <Activity className="w-6 h-6 text-primary" />
                Roteiro de Homologação
              </h2>
              
              <div className="grid gap-4">
                {steps.map((step) => (
                  <Card key={step.id} className={`p-6 transition-all hover:shadow-md border-2 ${
                    step.status === 'complete' ? 'border-green-100 hover:border-green-200' : 'hover:border-primary/20'
                  }`}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                          step.status === 'complete' ? 'bg-green-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                        }`}>
                          {step.status === 'complete' ? <CheckCircle2 className="w-6 h-6" /> : step.id}
                        </div>
                        <div>
                          <h3 className="font-bold uppercase tracking-tight text-slate-800 dark:text-slate-100">
                            Etapa {step.id}: {step.title}
                          </h3>
                          <Progress value={step.progress} className="h-1.5 w-32 mt-2" />
                        </div>
                      </div>
                      <Badge variant={step.status === 'complete' ? 'default' : 'outline'} className={`uppercase font-bold tracking-wider ${
                        step.status === 'complete' ? 'bg-green-500' : ''
                      }`}>
                        {step.status === 'complete' ? 'Validado' : 'Pendente'}
                      </Badge>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-4 space-y-6">
            <Card className="p-6 bg-primary text-primary-foreground space-y-6 border-none shadow-xl">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-8 h-8 opacity-50" />
                <h2 className="text-xl font-black uppercase tracking-tighter">Diretriz Crítica</h2>
              </div>
              <Separator className="bg-white/20" />
              <p className="text-xs opacity-90 leading-relaxed font-medium">
                Esta etapa é somente de validação e correção pontual. <span className="font-black underline">Não alterar</span> módulos homologados (IA, Home, RBAC, Auditoria Forense, etc).
              </p>
              <ul className="space-y-3 text-[10px] font-bold uppercase tracking-wide">
                <li className="flex items-center gap-2">
                  <ChevronRight className="w-3 h-3 text-white/50" />
                  Manter enum tipo_ausencia intacto
                </li>
                <li className="flex items-center gap-2">
                  <ChevronRight className="w-3 h-3 text-white/50" />
                  Preservar prompt da IA Redação
                </li>
                <li className="flex items-center gap-2">
                  <ChevronRight className="w-3 h-3 text-white/50" />
                  Não alterar o processamento interno
                </li>
              </ul>
            </Card>

            <Card className="p-6 space-y-6 border-2 border-slate-200 dark:border-slate-800">
              <div className="space-y-4">
                <h3 className="font-black uppercase tracking-tight text-sm text-slate-400 flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Casos de Teste
                </h3>
                <div className="space-y-2">
                  <TestCaseItem icon={<UserPlus className="w-3 h-3" />} label="Criação de Colaborador" />
                  <TestCaseItem icon={<ArrowRightLeft className="w-3 h-3" />} label="Reutilização de Matrícula" />
                  <TestCaseItem icon={<Search className="w-3 h-3" />} label="Busca Zeros à Esquerda" />
                  <TestCaseItem icon={<AlertCircle className="w-3 h-3" />} label="Transacionalidade (Rollback)" />
                  <TestCaseItem icon={<FileText className="w-3 h-3" />} label="Anexos e Documentos" />
                </div>
              </div>
            </Card>

            <footer className="text-center pt-8 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] leading-relaxed">
              CRM MK9 — HOMOLOGAÇÃO V2.0<br />
              Tecnologia, Integridade e Governança
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}

function TestCaseItem({ icon, label }: { icon: React.ReactNode, label: string }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-transparent">
      <span className="text-[10px] font-bold uppercase tracking-tight text-slate-600 dark:text-slate-400">{label}</span>
      <div className="p-1 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500">{icon}</div>
    </div>
  );
}
