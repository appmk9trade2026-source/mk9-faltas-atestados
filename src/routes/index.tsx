import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, Info, ClipboardList, AlertCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  component: HomologacaoHome,
});

function HomologacaoHome() {
  return (
    <AppShell title="CRM MK9 — Homologação" breadcrumb={["Início"]}>
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        {/* Header Section */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <ShieldCheck className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-xl font-bold tracking-tight">CRM MK9 — HOMOLOGAÇÃO FUNCIONAL</h1>
                <p className="text-sm text-muted-foreground uppercase font-medium">Lançamento manual com matrícula realmente inexistente</p>
              </div>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Info className="h-4 w-4" /> CONTEXTO
                </div>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• A Home foi restaurada e está protegida.</li>
                  <li>• Nenhum outro módulo foi alterado.</li>
                  <li>• Fluxo de lançamento manual com correções preservadas.</li>
                </ul>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <AlertCircle className="h-4 w-4 text-amber-500" /> DIRETRIZ CRÍTICA
                </div>
                <p className="text-xs text-muted-foreground">
                  NÃO alterar: RLS, RBAC, RPCs, Notificações, Auditoria Forense, ou qualquer código operacional durante o teste.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Steps Grid */}
        <div className="grid gap-4">
          <StepCard 
            number="1" 
            title="ESCOLHER MATRÍCULA DE TESTE" 
            content="Escolher uma matrícula numérica válida e inexistente. Consultar o banco e confirmar COUNT inicial = 0."
          />
          <StepCard 
            number="2" 
            title="TESTE COM SUPERVISOR" 
            content="Nova Ausência → informar matrícula inexistente → Preenchimento manual. Preencher Nome, Telefone, Empresa, Supervisor e Projeto."
          />
          <StepCard 
            number="3" 
            title="VALIDAR O ERRO ORIGINAL" 
            content="Confirmar que NÃO aparece 'Informe o nome completo...' quando manual_nome estiver preenchido."
          />
          <StepCard 
            number="4" 
            title="TESTE SEM BLUR" 
            content="No último campo: digitar valor, manter o foco e clicar em Enviar Lançamento. Resultado esperado: submissão sem perda de dados."
          />
          <div className="grid md:grid-cols-2 gap-4">
            <StepCard 
              number="5" 
              title="VALIDAR COLABORADOR" 
              content="Consultar public.colaboradores: id, matrícula, nome, empresa, projeto, supervisor e created_at."
            />
            <StepCard 
              number="6" 
              title="VALIDAR AUSÊNCIA" 
              content="Consultar public.ausencias: protocolo, colaborador_id, tipo, status e status_processamento."
            />
          </div>
          <StepCard 
            number="7" 
            title="FIND-OR-CREATE" 
            content="Pesquisar novamente a mesma matrícula. Resultado: colaborador localizado e dados carregados sem novo cadastro (COUNT = 1)."
          />
        </div>

        {/* Rule of Stop */}
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="p-4 flex gap-3 items-start">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
            <div className="text-sm">
              <span className="font-bold text-destructive">REGRA DE PARADA:</span> Se qualquer erro aparecer, PARE. Não implemente correção automática. Apresente mensagem exata, etapa e causa observável.
            </div>
          </CardContent>
        </Card>

        {/* Acceptance Criteria */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <ClipboardList className="h-5 w-5 text-primary" />
              <h2 className="font-bold">CRITÉRIOS DE ACEITE</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
              <Criterion label="COUNT inicial = 0" />
              <Criterion label="Criação feita pela aplicação" />
              <Criterion label="Falso erro de nome não ocorre" />
              <Criterion label="Teste sem blur passa" />
              <Criterion label="Colaborador e Ausência criados" />
              <Criterion label="Protocolo gerado com sucesso" />
              <Criterion label="Find-or-Create localiza registro" />
              <Criterion label="Nenhuma duplicidade (COUNT = 1)" />
            </div>
          </CardContent>
        </Card>

        <div className="text-center">
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Preservando integralmente o Design System do CRM MK9
          </Badge>
        </div>
      </div>
    </AppShell>
  );
}

function StepCard({ number, title, content }: { number: string; title: string; content: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex gap-4">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
          {number}
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold leading-none uppercase">{title}</h3>
          <p className="text-sm text-muted-foreground leading-snug">{content}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Criterion({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
      {label}
    </div>
  );
}
