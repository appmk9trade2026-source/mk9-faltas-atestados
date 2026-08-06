import { createFileRoute } from '@tanstack/react-router';
import { 
  ShieldAlert, 
  ShieldCheck, 
  Lock, 
  EyeOff, 
  FileSearch, 
  CheckCircle2,
  AlertCircle,
  Activity,
  ChevronRight,
  ShieldIcon
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export const Route = createFileRoute('/')({
  component: SecurityHardeningPage,
});

function SecurityHardeningPage() {
  const steps = [
    { id: 1, title: "Inventário Completo", status: "complete", progress: 100 },
    { id: 2, title: "RLS Contestações", status: "complete", progress: 100 },
    { id: 3, title: "Escrita em Contestações", status: "complete", progress: 100 },
    { id: 4, title: "Comentários de Alertas", status: "complete", progress: 100 },
    { id: 5, title: "Auditoria Field Audit", status: "complete", progress: 100 },
    { id: 6, title: "Security Definer Hardening", status: "complete", progress: 100 },
    { id: 7, title: "Mitigação de Escopo", status: "complete", progress: 100 },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 md:p-12 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-primary font-bold uppercase tracking-widest text-sm">
              <ShieldCheck className="w-4 h-4" />
              Governança Operacional & Segurança
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 dark:text-white uppercase italic">
              Hardening de <span className="text-primary underline decoration-primary/30">Segurança</span>
            </h1>
            <p className="text-slate-500 font-medium max-w-2xl">
              Correção de vulnerabilidades de RLS, auditoria forense e mitigação de escalonamento de privilégios.
            </p>
          </div>
          
          <div className="flex items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border shadow-sm">
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Project Ref</p>
              <p className="text-sm font-mono font-bold text-primary tracking-tight">wgozydjiuimxxddhodax</p>
            </div>
            <Separator orientation="vertical" className="h-8" />
            <div className="flex flex-col items-center">
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200 font-bold">
                AUDITORIA CONCLUÍDA
              </Badge>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-8 space-y-8">
            {/* Achados Section */}
            <section className="bg-white dark:bg-slate-900 rounded-3xl border shadow-lg overflow-hidden">
              <div className="bg-slate-900 p-6 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-6 h-6 text-green-400" />
                  <h2 className="text-xl font-bold uppercase tracking-tight">Achados Corrigidos</h2>
                </div>
                <Badge className="bg-green-500 text-white uppercase font-black tracking-widest px-3">
                  Hardened
                </Badge>
              </div>
              
              <div className="p-6 space-y-4">
                <FindingItem 
                  icon={<ShieldCheck className="w-5 h-5 text-green-500" />}
                  title="Acesso excessivo em Contestações"
                  description="Policy SELECT restrita via helper pode_ver_contestacao() validando escopo de projeto e equipe."
                />
                <FindingItem 
                  icon={<ShieldCheck className="w-5 h-5 text-green-500" />}
                  title="Comentários de Alertas Blindados"
                  description="Introduzida classificação ENUM (OPERACIONAL, RH, COMPLIANCE) com visibilidade segregada."
                />
                <FindingItem 
                  icon={<ShieldCheck className="w-5 h-5 text-green-500" />}
                  title="Auditoria Forense Segregada"
                  description="Field Audit restrito a Super Admin e RH/Compliance com acesso explícito ao projeto."
                />
                <FindingItem 
                  icon={<ShieldCheck className="w-5 h-5 text-green-500" />}
                  title="REVOKE PUBLIC em SECURITY DEFINER"
                  description="Todas as funções privilegiadas tiveram permissões revogadas de PUBLIC e anon."
                />
              </div>
            </section>

            {/* Roadmap */}
            <section className="space-y-4">
              <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
                <Activity className="w-6 h-6 text-primary" />
                Roteiro de Execução
              </h2>
              
              <div className="grid gap-4">
                {steps.map((step) => (
                  <Card key={step.id} className="p-6 transition-all hover:shadow-md border-2 hover:border-primary/20">
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
                      <Badge variant={step.status === 'complete' ? 'default' : 'outline'} className="uppercase font-bold tracking-wider">
                        {step.status === 'complete' ? 'Concluído' : 'Aguardando'}
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
                <ShieldIcon className="w-8 h-8 opacity-50" />
                <h2 className="text-xl font-black uppercase tracking-tighter">Diretrizes Rígidas</h2>
              </div>
              <Separator className="bg-white/20" />
              <ul className="space-y-4 text-sm font-medium">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>RLS sempre ativo com validação de escopo.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>GRANTs restritos ao papel authenticated.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>REVOKE ALL de PUBLIC para SECURITY DEFINER.</span>
                </li>
                <li className="flex items-start gap-3 text-white font-bold italic">
                  <ChevronRight className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Ambiente homologado e endurecido.</span>
                </li>
              </ul>
            </Card>

            <Card className="p-6 space-y-4 border-2 border-slate-200 dark:border-slate-800">
              <h3 className="font-black uppercase tracking-tight text-sm text-slate-400">Escopos Identificados</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Super Admin</span>
                  <Badge className="bg-green-500/10 text-green-600 border-green-200 font-bold">GLOBAL</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-500">RH / Compliance</span>
                  <Badge variant="outline" className="text-primary border-primary/20 font-bold uppercase">Projeto/Empresa</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Supervisor</span>
                  <Badge variant="outline" className="text-slate-400 border-slate-200 font-bold uppercase">Equipe Própria</Badge>
                </div>
              </div>
            </Card>

            <footer className="text-center pt-8 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] leading-relaxed">
              CRM MK9 — HARDENING V1.0<br />
              Tecnologia, Auditoria e Governança Forense
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}

function FindingItem({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-transparent hover:border-slate-200 transition-all">
      <div className="mt-1">{icon}</div>
      <div className="space-y-1">
        <h4 className="font-bold text-slate-800 dark:text-slate-100 uppercase tracking-tight">{title}</h4>
        <p className="text-xs text-slate-500 font-medium leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
