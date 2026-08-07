import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Info, ListChecks, Database, UserCheck, Search, Send, Fingerprint, Bell, Users, AlertCircle, Rocket } from "lucide-react";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <AppShell title="Homologação MK9" breadcrumb={["Início"]}>
      <div className="max-w-4xl mx-auto space-y-8 pb-12">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">CRM MK9 — HOMOLOGAÇÃO FUNCIONAL LIMPA DO LANÇAMENTO MANUAL</h1>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Badge variant="outline" className="font-mono">UAT-LANC-MANUAL-2026</Badge>
            <span>•</span>
            <span className="text-sm">Status: Aguardando Execução</span>
          </div>
        </div>

        <Card className="border-blue-100 bg-blue-50/30 dark:bg-blue-950/10 dark:border-blue-900/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-600" />
              CONTEXTO
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-4">
            <p>O diagnóstico histórico da matrícula 2760 foi corrigido.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="font-medium text-blue-900 dark:text-blue-200">Estado correto:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>No momento do erro original, matrícula 2760 era inexistente;</li>
                  <li>Posteriormente foi cadastrada diretamente no banco;</li>
                  <li>Portanto não deve mais ser utilizada como evidência de criação manual;</li>
                </ul>
              </div>
              <div className="space-y-2">
                <p className="font-medium text-blue-900 dark:text-blue-200">Diretrizes:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Hipótese original de RLS foi descartada;</li>
                  <li>Proteção contra duplicidade permanece apenas como hardening preventivo.</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-primary" />
                OBJETIVO
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Executar uma homologação funcional limpa do lançamento manual utilizando uma matrícula REALMENTE inexistente e com formato válido para o sistema.
            </CardContent>
          </Card>

          <Card className="border-amber-100 bg-amber-50/30 dark:bg-amber-950/10 dark:border-amber-900/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-amber-900 dark:text-amber-200">
                <ShieldAlert className="h-5 w-5 text-amber-600" />
                IMPORTANTE
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-2">
              <p className="font-semibold text-amber-800 dark:text-amber-300 underline uppercase">Nesta etapa NÃO alterar:</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-amber-700 dark:text-amber-400">
                <span>• Código</span>
                <span>• Banco (manual)</span>
                <span>• Migrations</span>
                <span>• RPCs / RLS / RBAC</span>
                <span>• Home / Refatorações</span>
                <span>• Novos fallbacks</span>
              </div>
              <p className="mt-2 text-center font-bold text-amber-900 dark:text-amber-200 uppercase">O objetivo é TESTAR o código atual.</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <SectionHeader number="1" title="ESCOLHER MATRÍCULA DE TESTE" icon={Search} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 text-sm">
              <p className="font-medium">Formato Válido:</p>
              <p className="text-muted-foreground italic">Escolher uma matrícula fictícia compatível com o formato real (ex: 987654).</p>
              <div className="rounded bg-muted p-2 text-xs font-mono text-red-600 dark:text-red-400">
                NÃO utilizar "TEST9999" se o campo for numérico.
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <p className="font-medium">Validação Prévia:</p>
              <p className="text-muted-foreground italic">Consultar o banco antes de iniciar: Confirmar COUNT(*) = 0 para empresa_id + matricula.</p>
            </div>
          </div>

          <SectionHeader number="2" title="REGISTRAR ESTADO INICIAL" icon={Database} />
          <div className="rounded-lg border p-4 bg-muted/20 grid grid-cols-2 gap-4 text-sm font-mono">
            <div>
              <p className="text-muted-foreground">matrícula:</p>
              <p className="border-b border-dashed">[...]</p>
            </div>
            <div>
              <p className="text-muted-foreground">empresa:</p>
              <p className="border-b border-dashed">[...]</p>
            </div>
            <div>
              <p className="text-muted-foreground">projeto:</p>
              <p className="border-b border-dashed">[...]</p>
            </div>
            <div>
              <p className="text-muted-foreground">COUNT inicial:</p>
              <p>0</p>
            </div>
          </div>

          <SectionHeader number="3" title="EXECUTAR COM SUPERVISOR REAL" icon={UserCheck} />
          <div className="bg-primary/5 rounded-lg border border-primary/20 p-4 space-y-3 text-sm">
            <div className="flex items-center gap-2 font-semibold text-primary">
              <Rocket className="h-4 w-4" />
              Fluxo na Interface
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Acessar <strong>Nova Ausência</strong> → informar matrícula inexistente → Atualizar resultados → confirmar “Colaborador não localizado” → Preenchimento manual de todos os campos obrigatórios → Enviar Lançamento.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <SectionHeader number="4" title="VALIDAR ERRO ORIGINAL" icon={ShieldAlert} />
              <p className="text-sm text-muted-foreground leading-relaxed">
                O erro <span className="text-red-600 font-mono italic">“Informe o nome completo...”</span> <strong>NÃO pode aparecer</strong> quando o Nome estiver preenchido (mínimo 3 chars).
              </p>
            </div>
            <div className="space-y-4">
              <SectionHeader number="5" title="TESTE SEM BLUR" icon={Fingerprint} />
              <p className="text-sm text-muted-foreground leading-relaxed">
                Preencher o último campo, manter o foco e clicar direto em <strong>Enviar Lançamento</strong>. O submit deve funcionar sem perder dados.
              </p>
            </div>
          </div>

          <SectionHeader number="6 & 7" title="VALIDAR PERSISTÊNCIA" icon={Database} />
          <div className="grid gap-4 sm:grid-cols-2 text-xs font-mono">
            <div className="rounded border p-3 space-y-1">
              <p className="font-bold text-primary mb-2">public.colaboradores</p>
              <p>id, matrícula, nome_completo</p>
              <p>empresa_id, projeto_id</p>
              <p>supervisor_usuario_id</p>
            </div>
            <div className="rounded border p-3 space-y-1">
              <p className="font-bold text-primary mb-2">public.ausencias</p>
              <p>id, protocolo, colaborador_id</p>
              <p>tipo (validar enum real), status</p>
              <p>origem_registro, criado_por</p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <SectionHeader number="9 & 10" title="FIND-OR-CREATE & DUPLICIDADE" icon={Users} />
              <p className="text-sm text-muted-foreground leading-relaxed">
                Ao pesquisar a <strong>mesma matrícula</strong> novamente, o colaborador deve ser localizado e o COUNT final deve permanecer igual a 1.
              </p>
            </div>
            <div className="space-y-4">
              <SectionHeader number="11 & 12" title="AUDITORIA & NOTIFICAÇÕES" icon={Bell} />
              <p className="text-sm text-muted-foreground leading-relaxed">
                Validar evento em <code>audit_logs</code> e confirmar o enfileiramento das comunicações previstas (ENFILEIRADA/ENVIADA).
              </p>
            </div>
          </div>
        </div>

        <Card className="border-red-100 bg-red-50/30 dark:bg-red-950/10 dark:border-red-900/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-red-900 dark:text-red-200 uppercase tracking-widest">
              <AlertCircle className="h-5 w-5 text-red-600" />
              REGRA DE PARADA
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p className="font-bold text-red-800 dark:text-red-300">Se surgir qualquer erro: PARE.</p>
            <p className="text-red-700 dark:text-red-400">Não implemente correção automática. Apresente mensagem exata, etapa, camada e causa observável. Aguarde autorização.</p>
          </CardContent>
        </Card>

        <div className="pt-8 border-t text-center space-y-4">
            <p className="text-sm font-semibold text-primary uppercase tracking-widest italic">
              LANÇAMENTO MANUAL — HOMOLOGAÇÃO FUNCIONAL EM ANDAMENTO
            </p>
            <p className="text-xs text-muted-foreground max-w-lg mx-auto leading-relaxed">
                A interface e identidade visual preservam o Design System CRM MK9, focando em harmonia, usabilidade intuitiva e governança técnica.
            </p>
        </div>
      </div>
    </AppShell>
  );
}

function SectionHeader({ number, title, icon: Icon }: { number: string; title: string; icon: any }) {
  return (
    <div className="flex items-center gap-3 border-b pb-2 mt-8 mb-4">
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
        {number}
      </div>
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h2 className="text-sm font-bold uppercase tracking-wider">{title}</h2>
    </div>
  );
}
