import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, FlaskConical, Loader2, PlayCircle, ShieldAlert, Users, Clock, ListChecks,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type SimEvent = {
  origem: string; tipo_evento: string; ambiente: string; severidade: string;
  prioridade?: string; status_incidente?: string; categoria?: string; modulo?: string;
  possui_responsavel?: string; percentual_sla_consumido?: string; minutos_em_aberto?: string;
};

type SimResult = {
  evento_normalizado: Record<string, unknown>;
  regras_avaliadas: number;
  regras_correspondentes: Array<{
    regra_id: string; nome: string; prioridade: number;
    tempo_primeiro_alerta: number; tempo_escalonamento: number | null;
    papel_destino_inicial: string | null; papel_destino_escalado: string | null;
    repeticao: boolean; intervalo_repeticao_minutos: number | null; maximo_repeticoes: number | null;
    destinatarios_estimados: number; motivo_correspondencia: string;
  }>;
  destinatarios_previstos: Array<{ papel: string; usuarios: number; regra_id: string }>;
  notificacoes_previstas: number;
  notificacoes_obrigatorias: number;
  notificacoes_opcionais: number;
  escalonamentos_previstos: number;
  avisos: string[];
  erros_validacao: string[];
  readonly: boolean;
};

const CENARIOS: Array<{ label: string; ev: Partial<SimEvent> }> = [
  { label: "Incidente P1 sem responsável", ev: { tipo_evento: "INCIDENTE_P1", severidade: "ALTA", possui_responsavel: "false" } },
  { label: "Incidente CRÍTICO aberto", ev: { tipo_evento: "INCIDENTE_CRITICO", severidade: "CRITICA" } },
  { label: "SLA em 75%", ev: { tipo_evento: "SLA_PROXIMO", severidade: "ATENCAO", percentual_sla_consumido: "75" } },
  { label: "SLA em 90%", ev: { tipo_evento: "SLA_PROXIMO", severidade: "ALTA", percentual_sla_consumido: "90" } },
  { label: "SLA vencido", ev: { tipo_evento: "SLA_VENCIDO", severidade: "CRITICA" } },
  { label: "Validação pendente", ev: { tipo_evento: "VALIDACAO_PENDENTE", severidade: "ATENCAO" } },
  { label: "Backup falhou", ev: { tipo_evento: "BACKUP_FALHOU", severidade: "CRITICA" } },
  { label: "Evento informativo", ev: { tipo_evento: "SISTEMA", severidade: "INFO" } },
];

const EMPTY: SimEvent = {
  origem: "OPERACAO_ASSISTIDA", tipo_evento: "", ambiente: "producao", severidade: "INFO",
};

export function SimuladorTab({ readonly }: { readonly: boolean }) {
  const [ev, setEv] = useState<SimEvent>(EMPTY);
  const [result, setResult] = useState<SimResult | null>(null);

  const sim = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("simular_regras_escalonamento", { p_evento: ev });
      if (error) throw error;
      return data as unknown as SimResult;
    },
    onSuccess: (d) => { setResult(d); toast.success("Simulação concluída (nenhum registro persistido)"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const conflitos = useQuery<{ total: number; conflitos: Array<{ tipo_conflito: string; severidade: string; descricao: string; recomendacao: string }> }>({
    queryKey: ["conflitos_regras"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("analisar_conflitos_regras_escalonamento");
      if (error) throw error;
      return data as { total: number; conflitos: Array<{ tipo_conflito: string; severidade: string; descricao: string; recomendacao: string }> };
    },
  });

  return (
    <div className="space-y-4">
      <Alert>
        <FlaskConical className="h-4 w-4" />
        <AlertTitle>Simulador administrativo</AlertTitle>
        <AlertDescription className="text-xs">
          Avalia como as regras responderiam a um evento hipotético.
          <strong> Nenhuma notificação, evento, alerta, execução ou consumo de idempotência é gerado.</strong>
          {readonly && <> Modo somente leitura (Compliance).</>}
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Form */}
        <Card className="lg:col-span-1">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">Evento hipotético</h3>

            <div>
              <Label className="text-xs">Cenários pré-definidos</Label>
              <Select onValueChange={(v) => {
                const c = CENARIOS[parseInt(v)];
                if (c) setEv({ ...EMPTY, ...c.ev } as SimEvent);
              }}>
                <SelectTrigger><SelectValue placeholder="Selecionar cenário fictício…" /></SelectTrigger>
                <SelectContent>
                  {CENARIOS.map((c, i) => (
                    <SelectItem key={i} value={String(i)}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[10px] text-muted-foreground">Dados fictícios; não executam até você clicar em Simular.</p>
            </div>

            <div>
              <Label className="text-xs">Tipo de evento *</Label>
              <Select value={ev.tipo_evento} onValueChange={(v) => setEv({ ...ev, tipo_evento: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar…" /></SelectTrigger>
                <SelectContent>
                  {["INCIDENTE_CRIADO","INCIDENTE_ATRIBUIDO","INCIDENTE_RECLASSIFICADO","INCIDENTE_CRITICO","INCIDENTE_P1","SLA_PROXIMO","SLA_VENCIDO","VALIDACAO_PENDENTE","INCIDENTE_RESOLVIDO","INCIDENTE_REABERTO","PERIODO_PROXIMO_DO_FIM","PERIODO_PRORROGADO","ALERTA_OPERACIONAL","DEPLOY_COM_INCIDENTE","BACKUP_FALHOU","SISTEMA"].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Severidade</Label>
                <Select value={ev.severidade} onValueChange={(v) => setEv({ ...ev, severidade: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["INFO","ATENCAO","ALTA","CRITICA"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Origem</Label>
                <Select value={ev.origem} onValueChange={(v) => setEv({ ...ev, origem: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["OPERACAO_ASSISTIDA","OPERACOES","DEPLOY","BACKUP","HEALTH_CHECK","SISTEMA"].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Ambiente</Label>
                <Input value={ev.ambiente} onChange={(e) => setEv({ ...ev, ambiente: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Prioridade</Label>
                <Input placeholder="P1, P2…" value={ev.prioridade ?? ""} onChange={(e) => setEv({ ...ev, prioridade: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">SLA consumido %</Label>
                <Input type="number" value={ev.percentual_sla_consumido ?? ""} onChange={(e) => setEv({ ...ev, percentual_sla_consumido: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Min. em aberto</Label>
                <Input type="number" value={ev.minutos_em_aberto ?? ""} onChange={(e) => setEv({ ...ev, minutos_em_aberto: e.target.value })} />
              </div>
            </div>

            <Button className="w-full" onClick={() => sim.mutate()} disabled={sim.isPending || !ev.tipo_evento}>
              {sim.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-1" />}
              Simular
            </Button>
          </CardContent>
        </Card>

        {/* Result */}
        <div className="lg:col-span-2 space-y-4">
          {!result && !sim.isPending && (
            <Card><CardContent className="p-12 text-center text-sm text-muted-foreground">
              <FlaskConical className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              Configure o evento e clique em Simular para ver o diagnóstico.
            </CardContent></Card>
          )}
          {sim.isPending && <Skeleton className="h-40" />}
          {result && <ResultView result={result} />}

          <ConflitosCard data={conflitos.data} loading={conflitos.isLoading} />
        </div>
      </div>
    </div>
  );
}

function ResultView({ result }: { result: SimResult }) {
  return (
    <>
      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi icon={ListChecks} label="Avaliadas" value={result.regras_avaliadas} />
          <Kpi icon={CheckCircle2} label="Correspondentes" value={result.regras_correspondentes.length} tone="ok" />
          <Kpi icon={Users} label="Destinatários" value={result.destinatarios_previstos.reduce((s, d) => s + d.usuarios, 0)} />
          <Kpi icon={ShieldAlert} label="Obrigatórias" value={result.notificacoes_obrigatorias} tone="danger" />
          <Kpi icon={Clock} label="Escalonamentos" value={result.escalonamentos_previstos} />
        </CardContent>
      </Card>

      {result.avisos?.length > 0 && (
        <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Avisos</AlertTitle>
          <AlertDescription><ul className="list-disc pl-5 text-xs">{result.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul></AlertDescription>
        </Alert>
      )}

      {result.erros_validacao?.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" /><AlertTitle>Erros de validação</AlertTitle>
          <AlertDescription><ul className="list-disc pl-5 text-xs">{result.erros_validacao.map((e, i) => <li key={i}>{e}</li>)}</ul></AlertDescription>
        </Alert>
      )}

      <Accordion type="multiple" defaultValue={["regras", "timeline"]}>
        <AccordionItem value="regras">
          <AccordionTrigger>Regras correspondentes ({result.regras_correspondentes.length})</AccordionTrigger>
          <AccordionContent>
            {result.regras_correspondentes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma regra correspondeu ao evento.</p>
            ) : (
              <div className="space-y-2">
                {result.regras_correspondentes.map((r) => (
                  <Card key={r.regra_id}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{r.nome}</span>
                        <Badge variant="outline" className="text-[10px]">prioridade {r.prioridade}</Badge>
                        <Badge variant="outline" className="text-[10px]">{r.destinatarios_estimados} destinatário(s)</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{r.motivo_correspondencia}</p>
                      <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <span>1º alerta: <b>T+{r.tempo_primeiro_alerta}min</b></span>
                        <span>Escalona: <b>{r.tempo_escalonamento ? `T+${r.tempo_escalonamento}min` : "—"}</b></span>
                        <span>Destino: <b>{r.papel_destino_inicial ?? "—"}</b></span>
                        <span>Escalado: <b>{r.papel_destino_escalado ?? "—"}</b></span>
                      </div>
                      {r.destinatarios_estimados === 0 && r.papel_destino_inicial && (
                        <p className="mt-2 text-xs text-destructive">
                          Nenhum destinatário elegível encontrado para o papel configurado.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="timeline">
          <AccordionTrigger>Linha do tempo prevista</AccordionTrigger>
          <AccordionContent>
            {result.regras_correspondentes.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <div className="space-y-2">
                {result.regras_correspondentes.map((r) => (
                  <div key={r.regra_id} className="border-l-2 border-primary/40 pl-3 py-1 text-xs">
                    <div className="font-medium">{r.nome}</div>
                    <div className="text-muted-foreground">T+{r.tempo_primeiro_alerta}min — 1º alerta para {r.papel_destino_inicial ?? "—"}</div>
                    {r.tempo_escalonamento != null && (
                      <div className="text-muted-foreground">T+{r.tempo_escalonamento}min — escalona para {r.papel_destino_escalado ?? "—"}</div>
                    )}
                    {r.repeticao && r.intervalo_repeticao_minutos && (
                      <div className="text-muted-foreground">
                        Repete a cada {r.intervalo_repeticao_minutos}min (máx {r.maximo_repeticoes ?? "∞"})
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="evento">
          <AccordionTrigger>Evento normalizado</AccordionTrigger>
          <AccordionContent>
            <pre className="text-xs bg-muted p-3 rounded overflow-auto">
              {JSON.stringify(result.evento_normalizado, null, 2)}
            </pre>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  );
}

function ConflitosCard({ data, loading }: {
  data?: { total: number; conflitos: Array<{ tipo_conflito: string; severidade: string; descricao: string; recomendacao: string }> };
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Análise de conflitos entre regras
          </h3>
          <Badge variant="outline">{data?.total ?? "—"} conflito(s)</Badge>
        </div>
        {loading ? <Skeleton className="h-20" /> : (
          !data || data.total === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum conflito detectado.</p>
          ) : (
            <div className="space-y-2">
              {data.conflitos.map((c, i) => (
                <div key={i} className="border rounded p-2 text-xs space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{c.tipo_conflito}</Badge>
                    <Badge variant="outline" className="text-[10px]">{c.severidade}</Badge>
                  </div>
                  <div>{c.descricao}</div>
                  <div className="text-muted-foreground">→ {c.recomendacao}</div>
                </div>
              ))}
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; tone?: "ok" | "danger" }) {
  const toneCls = tone === "danger" ? "text-destructive" : tone === "ok" ? "text-emerald-600" : "text-primary";
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${toneCls}`} />
      </div>
      <div className={`mt-1 text-xl font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}
