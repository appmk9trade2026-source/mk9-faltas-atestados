// Central de Alertas Operacionais — Onda 3
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter as FilterIcon,
  Info,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
  Undo2,
  UserCheck,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  listarAlertas,
  obterAlertaDetalhe,
  listarFiltrosDeAlertas,
  obterContagemAlertasMenu,
  marcarAlertaComoLido,
  assumirAlerta,
  resolverAlerta,
  dispensarAlerta,
  reabrirAlerta,
  type AlertaResumo,
  type AlertaSeveridade,
  type AlertaStatus,
} from "@/lib/alertas.functions";

const searchSchema = z.object({
  status: fallback(z.string(), "").default(""),
  severidade: fallback(z.string(), "").default(""),
  empresa: fallback(z.string(), "").default(""),
  projeto: fallback(z.string(), "").default(""),
  regra: fallback(z.string(), "").default(""),
  categoria: fallback(z.string(), "").default(""),
  vencidos: fallback(z.string(), "").default(""),
  meus: fallback(z.string(), "").default(""),
  q: fallback(z.string(), "").default(""),
  page: fallback(z.number(), 0).default(0),
  id: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_authenticated/alertas")({
  head: () => ({ meta: [{ title: "Alertas · CRM MK9" }] }),
  validateSearch: zodValidator(searchSchema),
  component: AlertasPage,
});

const SEV_STYLES: Record<AlertaSeveridade, { bg: string; text: string; border: string; icon: JSX.Element; label: string }> = {
  INFORMATIVO: {
    bg: "bg-blue-500/10", text: "text-blue-700 dark:text-blue-300", border: "border-blue-500/40",
    icon: <Info className="h-3.5 w-3.5" aria-hidden />, label: "Informativo",
  },
  ATENCAO: {
    bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-300", border: "border-amber-500/40",
    icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden />, label: "Atenção",
  },
  CRITICO: {
    bg: "bg-red-500/10", text: "text-red-700 dark:text-red-300", border: "border-red-500/40",
    icon: <ShieldAlert className="h-3.5 w-3.5" aria-hidden />, label: "Crítico",
  },
};

const STATUS_LABEL: Record<AlertaStatus, string> = {
  NOVO: "Novo",
  LIDO: "Lido",
  EM_TRATAMENTO: "Em tratamento",
  RESOLVIDO: "Resolvido",
  DISPENSADO: "Dispensado",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function AlertasPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const qc = useQueryClient();

  const listarFn = useServerFn(listarAlertas);
  const contagemFn = useServerFn(obterContagemAlertasMenu);
  const filtrosFn = useServerFn(listarFiltrosDeAlertas);
  const detalheFn = useServerFn(obterAlertaDetalhe);
  const lidoFn = useServerFn(marcarAlertaComoLido);
  const assumirFn = useServerFn(assumirAlerta);
  const resolverFn = useServerFn(resolverAlerta);
  const dispensarFn = useServerFn(dispensarAlerta);
  const reabrirFn = useServerFn(reabrirAlerta);

  const filtros = useQuery({
    queryKey: ["alertas", "filtros"],
    queryFn: () => filtrosFn(),
    staleTime: 60_000,
  });

  const contagem = useQuery({
    queryKey: ["alertas", "contagem"],
    queryFn: () => contagemFn(),
    refetchInterval: 60_000,
  });

  const listaKey = ["alertas", "lista", search] as const;
  const lista = useQuery({
    queryKey: listaKey,
    queryFn: () =>
      listarFn({
        data: {
          filtros: {
            status: search.status ? [search.status as AlertaStatus] : [],
            severidade: search.severidade ? [search.severidade as AlertaSeveridade] : [],
            empresa_id: search.empresa || null,
            projeto_id: search.projeto || null,
            regra_codigo: search.regra || null,
            categoria: search.categoria || null,
            vencidos: search.vencidos === "1",
            meus: search.meus === "1",
            q: search.q || null,
          },
          page: search.page,
          pageSize: 30,
        },
      }),
  });

  const detalhe = useQuery({
    queryKey: ["alertas", "detalhe", search.id],
    queryFn: () => detalheFn({ data: { id: search.id } }),
    enabled: !!search.id,
  });

  function setSearch(patch: Partial<z.infer<typeof searchSchema>>) {
    navigate({ search: (prev) => ({ ...prev, ...patch, page: patch.page ?? 0 }) });
  }

  function limparFiltros() {
    navigate({
      search: {
        status: "", severidade: "", empresa: "", projeto: "", regra: "",
        categoria: "", vencidos: "", meus: "", q: "", page: 0, id: "",
      },
    });
  }

  const acaoMut = useMutation({
    mutationFn: async (arg: { tipo: string; id: string; justificativa?: string }) => {
      switch (arg.tipo) {
        case "LIDO": return lidoFn({ data: { id: arg.id } });
        case "ASSUMIR": return assumirFn({ data: { id: arg.id } });
        case "RESOLVER":
          return resolverFn({ data: { id: arg.id, justificativa: arg.justificativa } });
        case "DISPENSAR":
          return dispensarFn({ data: { id: arg.id, justificativa: arg.justificativa ?? "" } });
        case "REABRIR":
          return reabrirFn({ data: { id: arg.id, justificativa: arg.justificativa ?? "" } });
        default: throw new Error("Ação desconhecida");
      }
    },
    onSuccess: () => {
      toast.success("Alerta atualizado");
      qc.invalidateQueries({ queryKey: ["alertas"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao atualizar alerta"),
  });

  const cards = contagem.data ?? {
    novos: 0, criticos_abertos: 0, em_tratamento: 0, vencidos: 0, resolvidos_hoje: 0, total_abertos: 0,
  };

  return (
    <AppShell title="Central de Alertas">
      <div className="space-y-6">
        {/* Cards resumo */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Novos", value: cards.novos, icon: <Bell className="h-4 w-4" />, tone: "text-blue-600" },
            { label: "Críticos abertos", value: cards.criticos_abertos, icon: <ShieldAlert className="h-4 w-4" />, tone: "text-red-600" },
            { label: "Em tratamento", value: cards.em_tratamento, icon: <Clock className="h-4 w-4" />, tone: "text-amber-600" },
            { label: "Vencidos", value: cards.vencidos, icon: <AlertTriangle className="h-4 w-4" />, tone: "text-orange-600" },
            { label: "Resolvidos hoje", value: cards.resolvidos_hoje, icon: <CheckCircle2 className="h-4 w-4" />, tone: "text-emerald-600" },
          ].map((c) => (
            <Card key={c.label} className="p-4">
              <div className={`flex items-center justify-between ${c.tone}`}>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</span>
                {c.icon}
              </div>
              <div className="mt-2 text-2xl font-semibold">{c.value}</div>
            </Card>
          ))}
        </div>

        {/* Filtros */}
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <FilterIcon className="h-4 w-4 text-muted-foreground" />
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Buscar alertas"
                className="pl-8 w-64"
                placeholder="Buscar título, regra…"
                defaultValue={search.q}
                onChange={(e) => {
                  const val = e.target.value;
                  const t = setTimeout(() => setSearch({ q: val }), 300);
                  return () => clearTimeout(t);
                }}
              />
            </div>

            <Select value={search.status || "TODOS"} onValueChange={(v) => setSearch({ status: v === "TODOS" ? "" : v })}>
              <SelectTrigger className="w-40" aria-label="Filtrar por status"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos os status</SelectItem>
                {(["NOVO", "LIDO", "EM_TRATAMENTO", "RESOLVIDO", "DISPENSADO"] as const).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={search.severidade || "TODAS"} onValueChange={(v) => setSearch({ severidade: v === "TODAS" ? "" : v })}>
              <SelectTrigger className="w-40" aria-label="Filtrar por severidade"><SelectValue placeholder="Severidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAS">Todas severidades</SelectItem>
                <SelectItem value="INFORMATIVO">Informativo</SelectItem>
                <SelectItem value="ATENCAO">Atenção</SelectItem>
                <SelectItem value="CRITICO">Crítico</SelectItem>
              </SelectContent>
            </Select>

            <Select value={search.empresa || "TODAS"} onValueChange={(v) => setSearch({ empresa: v === "TODAS" ? "" : v, projeto: "" })}>
              <SelectTrigger className="w-52" aria-label="Filtrar por empresa"><SelectValue placeholder="Empresa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAS">Todas as empresas</SelectItem>
                {(filtros.data?.empresas ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={search.projeto || "TODOS"} onValueChange={(v) => setSearch({ projeto: v === "TODOS" ? "" : v })}>
              <SelectTrigger className="w-52" aria-label="Filtrar por projeto"><SelectValue placeholder="Projeto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos os projetos</SelectItem>
                {(filtros.data?.projetos ?? [])
                  .filter((p) => !search.empresa || p.empresa_id === search.empresa)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
              </SelectContent>
            </Select>

            <Select value={search.regra || "TODAS"} onValueChange={(v) => setSearch({ regra: v === "TODAS" ? "" : v })}>
              <SelectTrigger className="w-56" aria-label="Filtrar por regra"><SelectValue placeholder="Regra" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAS">Todas as regras</SelectItem>
                {(filtros.data?.regras ?? []).map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              size="sm" variant={search.vencidos === "1" ? "default" : "outline"}
              onClick={() => setSearch({ vencidos: search.vencidos === "1" ? "" : "1" })}
            >
              <Clock className="h-3.5 w-3.5 mr-1" /> Vencidos
            </Button>
            <Button
              size="sm" variant={search.meus === "1" ? "default" : "outline"}
              onClick={() => setSearch({ meus: search.meus === "1" ? "" : "1" })}
            >
              <UserCheck className="h-3.5 w-3.5 mr-1" /> Meus alertas
            </Button>

            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={limparFiltros}>
                <X className="h-3.5 w-3.5 mr-1" /> Limpar
              </Button>
              <Button size="sm" variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["alertas"] })}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Atualizar
              </Button>
            </div>
          </div>
        </Card>

        {/* Lista */}
        <Card className="overflow-hidden">
          {lista.isLoading && (
            <div className="p-6 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          )}

          {lista.isError && (
            <div className="p-8 text-center space-y-3">
              <ShieldAlert className="h-8 w-8 mx-auto text-red-500" />
              <p className="text-sm text-muted-foreground">Não foi possível carregar os alertas.</p>
              <Button size="sm" onClick={() => lista.refetch()}>Tentar novamente</Button>
            </div>
          )}

          {lista.data && lista.data.items.length === 0 && (
            <div className="p-12 text-center space-y-2">
              <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500" />
              <p className="text-base font-medium">Nenhum alerta requer atenção neste momento.</p>
              {(search.status || search.severidade || search.empresa || search.projeto || search.regra || search.q || search.vencidos || search.meus) && (
                <Button size="sm" variant="link" onClick={limparFiltros}>Limpar filtros</Button>
              )}
            </div>
          )}

          {lista.data && lista.data.items.length > 0 && (
            <ul className="divide-y">
              {lista.data.items.map((a) => (
                <AlertaRow key={a.id} alerta={a} onClick={() => setSearch({ id: a.id })} />
              ))}
            </ul>
          )}

          {lista.data && lista.data.hasMore && (
            <div className="p-4 flex justify-center gap-2">
              <Button size="sm" variant="outline" disabled={search.page === 0}
                onClick={() => setSearch({ page: Math.max(0, search.page - 1) })}>Anterior</Button>
              <span className="text-sm text-muted-foreground self-center">
                Página {search.page + 1} · {lista.data.total} alertas
              </span>
              <Button size="sm" variant="outline"
                onClick={() => setSearch({ page: search.page + 1 })}>Próxima</Button>
            </div>
          )}
        </Card>
      </div>

      {/* Drawer detalhe */}
      <Sheet open={!!search.id} onOpenChange={(o) => { if (!o) setSearch({ id: "" }); }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {detalhe.isLoading && (
            <div className="space-y-3 pt-4">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}
          {detalhe.data && (() => {
            const a = detalhe.data.alerta as Record<string, any>;
            const sev = SEV_STYLES[a.severidade as AlertaSeveridade];
            const roles = detalhe.data.roles;
            const podeAgir = !roles.includes("visualizador");
            const [just, setJust] = [null, null] as any;
            return (
              <>
                <SheetHeader>
                  <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border w-fit ${sev.bg} ${sev.text} ${sev.border}`}>
                    {sev.icon}<span className="text-xs font-medium">{sev.label}</span>
                  </div>
                  <SheetTitle>{a.titulo}</SheetTitle>
                  <SheetDescription>{a.descricao}</SheetDescription>
                </SheetHeader>
                <div className="mt-4 space-y-4 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <Info2 label="Regra" value={a.regra_codigo} />
                    <Info2 label="Status" value={STATUS_LABEL[a.status as AlertaStatus]} />
                    <Info2 label="Empresa" value={detalhe.data.contexto.empresaNome ?? "—"} />
                    <Info2 label="Projeto" value={detalhe.data.contexto.projetoNome ?? "—"} />
                    <Info2 label="Colaborador" value={detalhe.data.contexto.colaboradorNome ?? "—"} />
                    <Info2 label="Detectado em" value={fmtDate(a.detectado_em)} />
                    <Info2 label="Prazo" value={fmtDate(a.prazo_em)} />
                    <Info2 label="Resolvido em" value={fmtDate(a.resolvido_em)} />
                  </div>

                  {a.acao_url && (
                    <Button asChild size="sm" variant="outline">
                      <a href={a.acao_url}><ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir recurso relacionado</a>
                    </Button>
                  )}

                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">Linha do tempo</Label>
                    <ol className="mt-2 space-y-2 border-l pl-4">
                      {(detalhe.data.eventos as any[]).map((e) => (
                        <li key={e.id} className="text-xs">
                          <div className="font-medium">{e.evento}</div>
                          <div className="text-muted-foreground">
                            {fmtDate(e.created_at)}
                            {e.status_anterior && e.status_novo && ` · ${e.status_anterior} → ${e.status_novo}`}
                          </div>
                          {e.justificativa && <div className="mt-1 italic">"{e.justificativa}"</div>}
                        </li>
                      ))}
                      {(detalhe.data.eventos as any[]).length === 0 && (
                        <li className="text-xs text-muted-foreground">Sem eventos registrados.</li>
                      )}
                    </ol>
                  </div>

                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">Metadata</Label>
                    <pre className="mt-2 text-[11px] bg-muted p-2 rounded overflow-auto max-h-40">
                      {JSON.stringify(a.metadata, null, 2)}
                    </pre>
                  </div>

                  {podeAgir && (
                    <AcoesAlerta
                      alerta={a as any}
                      onAction={(tipo, justificativa) =>
                        acaoMut.mutate({ tipo, id: a.id, justificativa })
                      }
                      pending={acaoMut.isPending}
                    />
                  )}
                </div>
              </>
            );
          })()}
          {detalhe.isError && (
            <div className="pt-6 text-sm text-red-600">Não foi possível carregar o alerta.</div>
          )}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function Info2({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function AlertaRow({ alerta, onClick }: { alerta: AlertaResumo; onClick: () => void }) {
  const sev = SEV_STYLES[alerta.severidade];
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left p-4 hover:bg-muted/40 transition-colors flex items-start gap-3"
      >
        <div className={`shrink-0 rounded-md p-2 border ${sev.bg} ${sev.text} ${sev.border}`}>
          {sev.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{alerta.titulo}</span>
            <Badge variant="outline" className="text-[10px]">{STATUS_LABEL[alerta.status]}</Badge>
            {alerta.vencido && <Badge variant="destructive" className="text-[10px]">Vencido</Badge>}
          </div>
          <div className="text-xs text-muted-foreground truncate">{alerta.descricao}</div>
          <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
            <span>Detectado em {fmtDate(alerta.detectado_em)}</span>
            <span>· {alerta.regra_codigo}</span>
            {alerta.prazo_em && <span>· Prazo: {fmtDate(alerta.prazo_em)}</span>}
          </div>
        </div>
      </button>
    </li>
  );
}

function AcoesAlerta({
  alerta, onAction, pending,
}: {
  alerta: { id: string; status: AlertaStatus; severidade: AlertaSeveridade };
  onAction: (tipo: string, justificativa?: string) => void;
  pending: boolean;
}) {
  const [just, setJust] = useState("");
  const encerrado = alerta.status === "RESOLVIDO" || alerta.status === "DISPENSADO";

  const criticoRequerJust = alerta.severidade === "CRITICO";

  return (
    <div className="pt-2 border-t space-y-3">
      <Label className="text-xs uppercase text-muted-foreground">Ações</Label>
      <Textarea
        aria-label="Justificativa"
        placeholder={
          encerrado
            ? "Justificativa para reabrir (obrigatória)"
            : "Justificativa (obrigatória para dispensar e para resolver críticos)"
        }
        value={just}
        onChange={(e) => setJust(e.target.value)}
        rows={2}
      />
      <div className="flex flex-wrap gap-2">
        {!encerrado && alerta.status === "NOVO" && (
          <Button size="sm" variant="secondary" disabled={pending}
            onClick={() => onAction("LIDO")}>
            <Zap className="h-3.5 w-3.5 mr-1" /> Marcar como lido
          </Button>
        )}
        {!encerrado && alerta.status !== "EM_TRATAMENTO" && (
          <Button size="sm" variant="secondary" disabled={pending}
            onClick={() => onAction("ASSUMIR")}>
            <UserCheck className="h-3.5 w-3.5 mr-1" /> Assumir
          </Button>
        )}
        {!encerrado && (
          <Button size="sm" disabled={pending || (criticoRequerJust && !just.trim())}
            onClick={() => onAction("RESOLVER", just || undefined)}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Resolver
          </Button>
        )}
        {!encerrado && (
          <Button size="sm" variant="outline" disabled={pending || !just.trim()}
            onClick={() => onAction("DISPENSAR", just)}>
            Dispensar
          </Button>
        )}
        {encerrado && (
          <Button size="sm" variant="outline" disabled={pending || !just.trim()}
            onClick={() => onAction("REABRIR", just)}>
            <Undo2 className="h-3.5 w-3.5 mr-1" /> Reabrir
          </Button>
        )}
        {pending && <Loader2 className="h-4 w-4 animate-spin self-center" />}
      </div>
    </div>
  );
}
