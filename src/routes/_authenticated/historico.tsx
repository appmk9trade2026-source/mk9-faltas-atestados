// Central de Histórico — timeline unificada de auditoria, WhatsApp e worker.
//
// - Filtros persistidos na URL (compartilháveis).
// - Paginação por página (memória, agrega três fontes).
// - Drawer lateral com detalhe do evento, mascarando PII conforme perfil.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  ArrowRight,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Copy,
  Filter as FilterIcon,
  History,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  ServerCog,
  ShieldAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listarHistorico,
  obterEventoDetalhe,
  listarFiltrosDoHistorico,
  type HistoricoItem,
  type HistoricoOrigem,
} from "@/lib/historico.functions";

// ---------------------------------------------------------------------------
// Search params (URL)
// ---------------------------------------------------------------------------

const searchSchema = z.object({
  de: fallback(z.string(), "").default(""),
  ate: fallback(z.string(), "").default(""),
  empresa: fallback(z.string(), "").default(""),
  projeto: fallback(z.string(), "").default(""),
  modulo: fallback(z.string(), "").default(""),
  acao: fallback(z.string(), "").default(""),
  usuario: fallback(z.string(), "").default(""),
  origem: fallback(z.string(), "TODAS").default("TODAS"),
  protocolo: fallback(z.string(), "").default(""),
  q: fallback(z.string(), "").default(""),
  page: fallback(z.number(), 0).default(0),
  evento: fallback(z.string(), "").default(""), // "AUDITORIA:uuid"
});

type SearchState = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({
    meta: [
      { title: "Histórico · CRM MK9" },
      { name: "description", content: "Linha do tempo de auditoria e comunicações." },
    ],
  }),
  validateSearch: zodValidator(searchSchema),
  component: HistoricoPage,
});

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const ORIGENS: { value: string; label: string }[] = [
  { value: "TODAS", label: "Todas as fontes" },
  { value: "AUDITORIA", label: "Auditoria" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "WORKER", label: "Worker" },
];

const MODULOS: string[] = [
  "ausencias",
  "colaboradores",
  "projetos",
  "empresas",
  "comunicacoes",
  "whatsapp",
  "usuarios",
  "importacoes",
  "auth",
  "historico",
];

const ORIGEM_STYLE: Record<
  HistoricoOrigem,
  { icon: typeof History; tone: string; label: string }
> = {
  AUDITORIA: { icon: History, tone: "bg-blue-500/10 text-blue-600 ring-blue-500/20", label: "Auditoria" },
  WHATSAPP: { icon: MessageSquare, tone: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20", label: "WhatsApp" },
  WORKER: { icon: ServerCog, tone: "bg-purple-500/10 text-purple-600 ring-purple-500/20", label: "Worker" },
};

const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

function HistoricoPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  // Debounce para busca livre
  const [qLocal, setQLocal] = useState(search.q);
  useEffect(() => setQLocal(search.q), [search.q]);
  useEffect(() => {
    if (qLocal === search.q) return;
    const t = setTimeout(() => {
      navigate({ search: (s: SearchState) => ({ ...s, q: qLocal, page: 0 }) });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qLocal]);

  const filtrosServer = useMemo(() => normalizeFilters(search), [search]);

  const listar = useServerFn(listarHistorico);
  const listaFiltros = useServerFn(listarFiltrosDoHistorico);

  const filtrosQ = useQuery({
    queryKey: ["historico-filtros-base"],
    queryFn: () => listaFiltros(),
    staleTime: 5 * 60_000,
  });

  const historicoQ = useQuery({
    queryKey: ["historico", filtrosServer, search.page],
    queryFn: () =>
      listar({
        data: { filtros: filtrosServer, page: search.page, pageSize: PAGE_SIZE },
      }),
    placeholderData: (prev) => prev,
  });

  const items = historicoQ.data?.items ?? [];
  const total = historicoQ.data?.total ?? 0;

  const activeChips = useMemo(() => buildChips(search, filtrosQ.data), [search, filtrosQ.data]);

  function clearFilters() {
    navigate({
      search: () => ({
        de: "",
        ate: "",
        empresa: "",
        projeto: "",
        modulo: "",
        acao: "",
        usuario: "",
        origem: "TODAS",
        protocolo: "",
        q: "",
        page: 0,
        evento: "",
      }),
    });
  }

  const eventoAbertoRef = search.evento;
  const parsedEvento = useMemo(() => parseEventoRef(eventoAbertoRef), [eventoAbertoRef]);

  function openEvento(item: HistoricoItem) {
    navigate({ search: (s: SearchState) => ({ ...s, evento: `${item.origem}:${item.id}` }) });
  }
  function closeEvento() {
    navigate({ search: (s: SearchState) => ({ ...s, evento: "" }) });
  }

  return (
    <AppShell title="Histórico" breadcrumb={["Histórico"]}>
      <p className="-mt-4 text-sm text-muted-foreground">
        Linha do tempo unificada de auditoria, comunicações do WhatsApp e execuções do
        worker. Dados sensíveis (CID, telefone, tokens) são mascarados conforme o
        seu perfil.
      </p>

      {/* --- Filtros --------------------------------------------------- */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <FilterIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filtros</span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => historicoQ.refetch()}
              disabled={historicoQ.isFetching}
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${historicoQ.isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            {activeChips.length > 0 && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <X className="mr-1 h-4 w-4" /> Limpar
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          <FField label="Data inicial">
            <Input
              type="date"
              value={search.de}
              onChange={(e) =>
                navigate({ search: (s: SearchState) => ({ ...s, de: e.target.value, page: 0 }) })
              }
            />
          </FField>
          <FField label="Data final">
            <Input
              type="date"
              value={search.ate}
              onChange={(e) =>
                navigate({ search: (s: SearchState) => ({ ...s, ate: e.target.value, page: 0 }) })
              }
            />
          </FField>

          <FField label="Empresa">
            <Select
              value={search.empresa || "all"}
              onValueChange={(v) =>
                navigate({
                  search: (s: SearchState) => ({ ...s, empresa: v === "all" ? "" : v, projeto: "", page: 0 }),
                })
              }
            >
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {(filtrosQ.data?.empresas ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FField>

          <FField label="Projeto">
            <Select
              value={search.projeto || "all"}
              onValueChange={(v) =>
                navigate({ search: (s: SearchState) => ({ ...s, projeto: v === "all" ? "" : v, page: 0 }) })
              }
            >
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(filtrosQ.data?.projetos ?? [])
                  .filter((p) => !search.empresa || p.empresa_id === search.empresa)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </FField>

          <FField label="Origem">
            <Select
              value={search.origem}
              onValueChange={(v) =>
                navigate({ search: (s: SearchState) => ({ ...s, origem: v, page: 0 }) })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORIGENS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FField>

          <FField label="Módulo">
            <Select
              value={search.modulo || "all"}
              onValueChange={(v) =>
                navigate({ search: (s: SearchState) => ({ ...s, modulo: v === "all" ? "" : v, page: 0 }) })
              }
            >
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {MODULOS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FField>

          <FField label="Ação">
            <Input
              placeholder="Ex.: CREATE, MUDANCA_STATUS…"
              value={search.acao}
              onChange={(e) =>
                navigate({ search: (s: SearchState) => ({ ...s, acao: e.target.value.toUpperCase().slice(0, 40), page: 0 }) })
              }
            />
          </FField>

          <FField label="Protocolo">
            <Input
              placeholder="Ex.: ADM-20260720"
              value={search.protocolo}
              onChange={(e) =>
                navigate({ search: (s: SearchState) => ({ ...s, protocolo: e.target.value.slice(0, 40), page: 0 }) })
              }
            />
          </FField>

          <div className="md:col-span-3 lg:col-span-4">
            <FField label="Buscar (usuário, entidade, observações)">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Digite ao menos 2 caracteres…"
                  value={qLocal}
                  onChange={(e) => setQLocal(e.target.value.slice(0, 120))}
                />
              </div>
            </FField>
          </div>
        </div>

        {activeChips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {activeChips.map((c) => (
              <Badge key={c.label} variant="secondary" className="font-normal">
                <span className="text-muted-foreground">{c.title}:</span>&nbsp;{c.label}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      {/* --- Timeline --------------------------------------------------- */}
      <Card className="p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm font-medium">
            {historicoQ.isLoading ? "Carregando eventos…" : `${total.toLocaleString("pt-BR")} evento(s)`}
          </div>
          {historicoQ.isFetching && !historicoQ.isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {historicoQ.isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : historicoQ.isError ? (
          <ErrorState
            message={(historicoQ.error as Error)?.message ?? "Erro ao carregar histórico."}
            onRetry={() => historicoQ.refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState hasFilters={activeChips.length > 0} onClear={clearFilters} />
        ) : (
          <ol className="divide-y">
            {items.map((it) => (
              <EventRow key={it.key} item={it} onOpen={openEvento} />
            ))}
          </ol>
        )}

        {/* Paginação */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
            <span>
              Página {search.page + 1} · exibindo {items.length} de {total}
            </span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={search.page <= 0}
                onClick={() =>
                  navigate({ search: (s: SearchState) => ({ ...s, page: Math.max(0, s.page - 1) }) })
                }
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!historicoQ.data?.hasMore}
                onClick={() =>
                  navigate({ search: (s: SearchState) => ({ ...s, page: s.page + 1 }) })
                }
              >
                Próxima <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* --- Drawer detalhe ------------------------------------------- */}
      <Sheet open={!!parsedEvento} onOpenChange={(o) => !o && closeEvento()}>
        <SheetContent className="w-full max-w-xl overflow-y-auto sm:max-w-xl">
          {parsedEvento && (
            <EventoDetalhe origem={parsedEvento.origem} id={parsedEvento.id} onClose={closeEvento} />
          )}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function FField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function EventRow({ item, onOpen }: { item: HistoricoItem; onOpen: (i: HistoricoItem) => void }) {
  const style = ORIGEM_STYLE[item.origem];
  const Icon = style.icon;
  const ok = item.sucesso !== false;

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="group flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-muted/40 focus:bg-muted/40 focus:outline-none"
      >
        <div className={`mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full ring-1 ${style.tone}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-medium">{item.acao}</span>
            {item.modulo && (
              <Badge variant="outline" className="text-[10px] font-normal">
                {item.modulo}
              </Badge>
            )}
            {!ok && (
              <Badge variant="destructive" className="gap-1 text-[10px]">
                <ShieldAlert className="h-3 w-3" /> falha
              </Badge>
            )}
          </div>
          <div className="mt-0.5 truncate text-sm text-muted-foreground">
            {item.resumo ?? item.entidade ?? "—"}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>{formatDateTime(item.ts)}</span>
            {item.usuario_nome && <span>· {item.usuario_nome}</span>}
            {item.perfil && <span>· {item.perfil}</span>}
            {item.origem_texto && <span>· {item.origem_texto}</span>}
          </div>
        </div>
        <ArrowRight className="mt-2 h-4 w-4 flex-none text-muted-foreground opacity-0 transition group-hover:opacity-100" />
      </button>
    </li>
  );
}

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <History className="h-8 w-8 text-muted-foreground" />
      <div>
        <p className="font-medium">Nenhum evento encontrado</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasFilters
            ? "Nenhum registro para os filtros atuais. Tente ampliar o período ou remover filtros."
            : "Assim que uma ação for realizada no sistema, o registro aparecerá aqui."}
        </p>
      </div>
      {hasFilters && (
        <Button variant="outline" size="sm" onClick={onClear}>
          Limpar filtros
        </Button>
      )}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <ShieldAlert className="h-8 w-8 text-destructive" />
      <div>
        <p className="font-medium">Não foi possível carregar o histórico</p>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
      <Button size="sm" onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  );
}

// ---------- Drawer -------------------------------------------------

function EventoDetalhe({
  origem,
  id,
  onClose: _onClose,
}: {
  origem: HistoricoOrigem;
  id: string;
  onClose: () => void;
}) {
  const obter = useServerFn(obterEventoDetalhe);
  const q = useQuery({
    queryKey: ["historico-evento", origem, id],
    queryFn: () => obter({ data: { origem, id } }),
  });

  if (q.isLoading) {
    return (
      <div className="space-y-3 py-4">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        {(q.error as Error)?.message ?? "Evento não encontrado."}
      </div>
    );
  }

  const d = q.data;
  const style = ORIGEM_STYLE[d.origem];

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <span className={`flex h-7 w-7 items-center justify-center rounded-full ring-1 ${style.tone}`}>
            <style.icon className="h-4 w-4" />
          </span>
          <span className="font-mono text-sm">
            {"acao" in d ? d.acao : "evento" in d ? d.evento : "worker" in d ? `WORKER_${d.status ?? ""}` : ""}
          </span>
        </SheetTitle>
        <SheetDescription>{formatDateTime(d.ts)}</SheetDescription>
      </SheetHeader>

      {d.origem === "AUDITORIA" && <DetalheAuditoria d={d} />}
      {d.origem === "WHATSAPP" && <DetalheWhatsapp d={d} />}
      {d.origem === "WORKER" && <DetalheWorker d={d} />}
    </>
  );
}

type AuditDetail = Extract<Awaited<ReturnType<typeof obterEventoDetalhe>>, { origem: "AUDITORIA" }>;
type WaDetail = Extract<Awaited<ReturnType<typeof obterEventoDetalhe>>, { origem: "WHATSAPP" }>;
type WorkerDetail = Extract<Awaited<ReturnType<typeof obterEventoDetalhe>>, { origem: "WORKER" }>;

function DetalheAuditoria({ d }: { d: AuditDetail }) {
  return (
    <div className="mt-4 space-y-4 text-sm">
      <div className="grid gap-2">
        <Info k="Módulo" v={d.modulo} />
        <Info k="Entidade" v={d.entidade} />
        <Info k="Registro" v={d.registro_id} mono copy />
        <Info k="Usuário" v={d.usuario_nome} />
        <Info k="Perfil" v={d.perfil} />
        <Info k="Origem" v={d.origem_texto} />
        <Info k="IP" v={d.ip} mono />
        <Info k="Sucesso" v={d.sucesso == null ? "—" : d.sucesso ? "Sim" : "Não"} />
      </div>

      {d.observacoes && (
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Observações</p>
          <p className="rounded border bg-muted/40 p-3 text-sm">{d.observacoes}</p>
        </div>
      )}

      <DiffBlock antes={d.antes} depois={d.depois} />
    </div>
  );
}

function DetalheWhatsapp({ d }: { d: WaDetail }) {
  return (
    <div className="mt-4 space-y-4 text-sm">
      <div className="grid gap-2">
        <Info k="Outbox ID" v={d.outbox_id} mono copy />
        <Info k="Evento" v={d.evento} />
        <Info k="Status anterior → novo" v={`${d.status_anterior ?? "?"} → ${d.status_novo ?? "?"}`} />
        <Info k="Código do provider" v={d.codigo} mono />
        <Info k="Provider message ID" v={d.provider_message_id ?? "—"} mono copy />
        {!d.provider_message_id && (
          <p className="text-xs text-muted-foreground">
            <BadgeCheck className="mr-1 inline h-3 w-3" />
            Provider message ID visível apenas para Super Admin.
          </p>
        )}
      </div>
      {d.mensagem_resumida && (
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Mensagem</p>
          <p className="rounded border bg-muted/40 p-3">{d.mensagem_resumida}</p>
        </div>
      )}
      {d.metadata_segura && (
        <JsonBlock title="Metadata segura" value={d.metadata_segura} />
      )}
    </div>
  );
}

function DetalheWorker({ d }: { d: WorkerDetail }) {
  return (
    <div className="mt-4 space-y-4 text-sm">
      <div className="grid gap-2">
        <Info k="Execution ID" v={d.execution_id} mono copy />
        <Info k="Worker" v={d.worker} />
        <Info k="Status" v={d.status} />
        <Info k="Início" v={d.inicio ? formatDateTime(d.inicio) : "—"} />
        <Info k="Fim" v={d.fim ? formatDateTime(d.fim) : "—"} />
        <Info k="Duração" v={d.duracao_ms != null ? `${d.duracao_ms} ms` : "—"} />
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
        <Metric label="Selecionadas" value={d.selecionadas} />
        <Metric label="Enviadas" value={d.enviadas} />
        <Metric label="Falhas temp." value={d.falhas_temporarias} />
        <Metric label="Falhas def." value={d.falhas_definitivas} />
        <Metric label="Ignoradas" value={d.ignoradas} />
      </div>
      {d.detalhes && <JsonBlock title="Detalhes" value={d.detalhes} />}
    </div>
  );
}

function Info({
  k,
  v,
  mono,
  copy,
}: {
  k: string;
  v: string | number | null | undefined;
  mono?: boolean;
  copy?: boolean;
}) {
  const val = v == null || v === "" ? "—" : String(v);
  return (
    <div className="flex items-start justify-between gap-3 border-b py-1 last:border-b-0">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className={`flex items-center gap-1 text-right ${mono ? "font-mono text-xs" : ""}`}>
        <span>{val}</span>
        {copy && v && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => copyText(String(v))}
            aria-label={`Copiar ${k}`}
          >
            <Copy className="h-3 w-3" />
          </button>
        )}
      </span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="rounded-md border p-2 text-center">
      <div className="text-lg font-semibold tabular-nums">{value ?? 0}</div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}

function DiffBlock({ antes, depois }: { antes: unknown; depois: unknown }) {
  const hasAntes = !!antes && !isEmpty(antes);
  const hasDepois = !!depois && !isEmpty(depois);
  if (!hasAntes && !hasDepois) return null;
  return (
    <div className="space-y-3">
      {hasAntes ? <JsonBlock title="Antes" value={antes} /> : null}
      {hasDepois ? <JsonBlock title="Depois" value={depois} /> : null}
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  const text = safeStringify(value);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">{title}</p>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => copyText(text)}
          aria-label={`Copiar ${title}`}
        >
          <ClipboardCopy className="h-3.5 w-3.5" />
        </button>
      </div>
      <pre className="max-h-72 overflow-auto rounded border bg-muted/40 p-3 text-[11px] leading-relaxed">
        {text}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function normalizeFilters(s: SearchState) {
  return {
    data_de: s.de || null,
    data_ate: s.ate || null,
    empresa_id: s.empresa || null,
    projeto_id: s.projeto || null,
    modulo: s.modulo || null,
    acao: s.acao || null,
    usuario_id: s.usuario || null,
    origem: ((s.origem || "TODAS") as "TODAS" | HistoricoOrigem) ?? "TODAS",
    protocolo: s.protocolo || null,
    q: s.q || null,
  };
}

type FiltrosBase = {
  empresas: { id: string; nome: string }[];
  projetos: { id: string; nome: string; empresa_id: string }[];
} | undefined;

function buildChips(s: SearchState, base: FiltrosBase) {
  const out: { title: string; label: string }[] = [];
  if (s.de) out.push({ title: "De", label: s.de });
  if (s.ate) out.push({ title: "Até", label: s.ate });
  if (s.empresa) {
    const n = base?.empresas.find((e) => e.id === s.empresa)?.nome ?? s.empresa;
    out.push({ title: "Empresa", label: n });
  }
  if (s.projeto) {
    const n = base?.projetos.find((p) => p.id === s.projeto)?.nome ?? s.projeto;
    out.push({ title: "Projeto", label: n });
  }
  if (s.origem && s.origem !== "TODAS") out.push({ title: "Origem", label: s.origem });
  if (s.modulo) out.push({ title: "Módulo", label: s.modulo });
  if (s.acao) out.push({ title: "Ação", label: s.acao });
  if (s.protocolo) out.push({ title: "Protocolo", label: s.protocolo });
  if (s.q) out.push({ title: "Busca", label: s.q });
  return out;
}

function parseEventoRef(raw: string): { origem: HistoricoOrigem; id: string } | null {
  if (!raw || !raw.includes(":")) return null;
  const [origem, id] = raw.split(":", 2);
  if (!["AUDITORIA", "WHATSAPP", "WORKER"].includes(origem)) return null;
  if (!/^[0-9a-f-]{20,}$/i.test(id)) return null;
  return { origem: origem as HistoricoOrigem, id };
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function copyText(t: string) {
  try {
    navigator.clipboard.writeText(t);
    toast.success("Copiado para a área de transferência.");
  } catch {
    toast.error("Não foi possível copiar.");
  }
}
