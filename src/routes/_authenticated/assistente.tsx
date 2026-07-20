import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, Send, Sparkles, Plus, Trash2, ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  listarConversasAssistente,
  criarConversaAssistente,
  arquivarConversaAssistente,
  listarMensagensAssistente,
  perguntarAoAssistente,
  registrarFeedbackAssistente,
} from "@/lib/assistente.functions";

export const Route = createFileRoute("/_authenticated/assistente")({
  head: () => ({
    meta: [
      { title: "Assistente IA — CRM MK9" },
      { name: "description", content: "Consultas em linguagem natural sobre faltas, atestados, alertas e comunicação." },
    ],
  }),
  component: AssistentePage,
});

const SUGESTOES = [
  "Resumo operacional de hoje",
  "Quantas faltas nos últimos 7 dias?",
  "Quais alertas críticos estão abertos?",
  "Compare faltas deste mês com o mês anterior",
  "Colaboradores sem WhatsApp válido",
  "Explique o que é absenteísmo",
];

type Conversa = {
  id: string;
  titulo: string | null;
  updated_at: string;
};

type Mensagem = {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM_TOOL";
  content: string;
  status: string;
  latency_ms: number | null;
  created_at: string;
  structured_content?: unknown;
};

function AssistentePage() {
  const qc = useQueryClient();
  const listar = useServerFn(listarConversasAssistente);
  const criar = useServerFn(criarConversaAssistente);
  const arquivar = useServerFn(arquivarConversaAssistente);
  const listarMsgs = useServerFn(listarMensagensAssistente);
  const perguntar = useServerFn(perguntarAoAssistente);
  const feedbackFn = useServerFn(registrarFeedbackAssistente);

  const [ativa, setAtiva] = React.useState<string | null>(null);
  const [pergunta, setPergunta] = React.useState("");
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const conversasQ = useQuery({
    queryKey: ["assistente", "conversas"],
    queryFn: () => listar(),
  });

  const conversas: Conversa[] = (conversasQ.data?.conversas ?? []) as Conversa[];

  React.useEffect(() => {
    if (!ativa && conversas.length > 0) setAtiva(conversas[0].id);
  }, [conversas, ativa]);

  const mensagensQ = useQuery({
    queryKey: ["assistente", "mensagens", ativa],
    queryFn: () => listarMsgs({ data: { conversation_id: ativa! } }),
    enabled: !!ativa,
  });
  const mensagens: Mensagem[] = (mensagensQ.data?.mensagens ?? []) as Mensagem[];

  const criarM = useMutation({
    mutationFn: () => criar({ data: {} }),
    onSuccess: async (row) => {
      await qc.invalidateQueries({ queryKey: ["assistente", "conversas"] });
      setAtiva((row as { id: string }).id);
      inputRef.current?.focus();
    },
  });

  const arquivarM = useMutation({
    mutationFn: (id: string) => arquivar({ data: { id } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["assistente", "conversas"] });
      setAtiva(null);
      toast.success("Conversa arquivada.");
    },
  });

  const perguntarM = useMutation({
    mutationFn: async (texto: string) => {
      let convId = ativa;
      if (!convId) {
        const row = (await criar({ data: {} })) as { id: string };
        convId = row.id;
        setAtiva(convId);
        await qc.invalidateQueries({ queryKey: ["assistente", "conversas"] });
      }
      return perguntar({ data: { conversation_id: convId!, pergunta: texto } });
    },
    onSuccess: async () => {
      setPergunta("");
      await qc.invalidateQueries({ queryKey: ["assistente", "mensagens", ativa] });
      await qc.invalidateQueries({ queryKey: ["assistente", "conversas"] });
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
      inputRef.current?.focus();
    },
    onError: (e: Error) => {
      toast.error(e.message || "Falha ao consultar o assistente.");
    },
  });

  const feedbackM = useMutation({
    mutationFn: (v: { message_id: string; rating: "UP" | "DOWN" }) => feedbackFn({ data: v }),
    onSuccess: () => toast.success("Obrigado pelo feedback."),
  });

  React.useEffect(() => {
    if (mensagens.length > 0) {
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    }
  }, [mensagens.length]);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, [ativa]);

  function enviar() {
    const t = pergunta.trim();
    if (!t || perguntarM.isPending) return;
    perguntarM.mutate(t);
  }

  return (
    <AppShell title="Assistente IA" breadcrumb={["Assistente"]}>
      <div className="grid grid-cols-12 gap-4">
        {/* Sidebar de conversas */}
        <aside className="col-span-12 md:col-span-3">
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b p-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conversas</span>
              <Button size="sm" variant="ghost" onClick={() => criarM.mutate()} disabled={criarM.isPending}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="h-[calc(100vh-260px)]">
              <div className="p-1.5 space-y-0.5">
                {conversasQ.isLoading && (
                  <div className="p-3 text-xs text-muted-foreground">Carregando…</div>
                )}
                {!conversasQ.isLoading && conversas.length === 0 && (
                  <div className="p-3 text-xs text-muted-foreground">
                    Nenhuma conversa. Faça sua primeira pergunta abaixo.
                  </div>
                )}
                {conversas.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm cursor-pointer",
                      ativa === c.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                    )}
                    onClick={() => setAtiva(c.id)}
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    <span className="flex-1 truncate text-[13px]">{c.titulo || "Nova conversa"}</span>
                    <button
                      className="opacity-0 group-hover:opacity-70 hover:opacity-100 transition"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Arquivar esta conversa?")) arquivarM.mutate(c.id);
                      }}
                      aria-label="Arquivar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </aside>

        {/* Chat */}
        <section className="col-span-12 md:col-span-9">
          <div className="flex h-[calc(100vh-200px)] flex-col rounded-lg border bg-card">
            <div className="flex items-center gap-2 border-b p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-primary to-primary/60 text-primary-foreground">
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold">Assistente MK9</span>
                <span className="text-[11px] text-muted-foreground">
                  Consulte dados operacionais em linguagem natural — sem SQL, sem PII.
                </span>
              </div>
            </div>

            <ScrollArea className="flex-1 p-4">
              {mensagens.length === 0 && !mensagensQ.isFetching && (
                <EmptyState onPick={(t) => { setPergunta(t); setTimeout(() => enviar(), 0); }} />
              )}
              <div className="mx-auto max-w-3xl space-y-4">
                {mensagens.map((m) => (
                  <MessageBubble
                    key={m.id}
                    m={m}
                    onFeedback={(r) => feedbackM.mutate({ message_id: m.id, rating: r })}
                  />
                ))}
                {perguntarM.isPending && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Consultando dados…
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>

            <Separator />

            <div className="p-3">
              <div className="relative mx-auto max-w-3xl">
                <Textarea
                  ref={inputRef}
                  value={pergunta}
                  onChange={(e) => setPergunta(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      enviar();
                    }
                  }}
                  placeholder="Pergunte algo… (Enter para enviar, Shift+Enter nova linha)"
                  className="min-h-[68px] resize-none pr-14"
                  disabled={perguntarM.isPending}
                  maxLength={2000}
                />
                <Button
                  size="icon"
                  className="absolute bottom-2 right-2 h-9 w-9"
                  onClick={enviar}
                  disabled={perguntarM.isPending || !pergunta.trim()}
                >
                  {perguntarM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <p className="mx-auto mt-1.5 max-w-3xl text-[10px] text-muted-foreground/70">
                O Assistente NUNCA revela CID, telefone, CPF ou dados clínicos. Respostas são geradas por IA a partir de ferramentas restritas — confira sempre as fontes citadas.
              </p>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function EmptyState({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className="mx-auto max-w-2xl py-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
        <Sparkles className="h-6 w-6 text-primary" />
      </div>
      <h2 className="mt-3 text-lg font-semibold">Olá! Como posso ajudar?</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pergunte sobre faltas, atestados, alertas, WhatsApp ou colaboradores. Comece com uma sugestão:
      </p>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGESTOES.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-md border bg-background/60 px-3 py-2 text-left text-sm hover:border-primary/40 hover:bg-accent/50 transition"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ m, onFeedback }: { m: Mensagem; onFeedback: (r: "UP" | "DOWN") => void }) {
  const isUser = m.role === "USER";
  const structured = React.useMemo(() => {
    if (!m.structured_content) return null;
    try {
      const s = typeof m.structured_content === "string" ? JSON.parse(m.structured_content) : m.structured_content;
      return s as { fontes?: Array<{ tool: string }> };
    } catch { return null; }
  }, [m.structured_content]);

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-primary px-3.5 py-2 text-sm text-primary-foreground shadow-sm">
          {m.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary/80 to-primary/50 text-primary-foreground">
        <Bot className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 space-y-2">
        <Card className="border-border/60">
          <CardContent className="p-3.5 text-sm whitespace-pre-wrap leading-relaxed">
            {m.status === "FAILED" ? (
              <span className="text-destructive">{m.content}</span>
            ) : (
              m.content || <span className="text-muted-foreground">Sem resposta.</span>
            )}
          </CardContent>
        </Card>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
          {structured?.fontes?.map((f, i) => (
            <Badge key={i} variant="outline" className="font-normal text-[10px]">
              {f.tool}
            </Badge>
          ))}
          {m.latency_ms != null && <span>· {m.latency_ms}ms</span>}
          <span className="ml-auto flex items-center gap-1">
            <button onClick={() => onFeedback("UP")} className="opacity-60 hover:opacity-100" aria-label="Útil">
              <ThumbsUp className="h-3 w-3" />
            </button>
            <button onClick={() => onFeedback("DOWN")} className="opacity-60 hover:opacity-100" aria-label="Não útil">
              <ThumbsDown className="h-3 w-3" />
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
