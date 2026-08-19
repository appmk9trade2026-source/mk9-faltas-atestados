import { useState, useEffect } from "react";
import {
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Clock, 
  User, 
  AlertCircle, 
  Copy, 
  Check,
  MessageSquare,
  History,
  ShieldCheck,
  Zap,
  BookPlus,
  ArrowUpRight,
  Loader2
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getTicketMessages, getRelatedArticles, createArticleFromTicket } from "@/lib/support.functions";
import { summarizeTicket, suggestDiagnosis, suggestReply } from "@/lib/ai-copilot.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Sparkles, BrainCircuit, MessageSquareCode, Send, Copy, AlertTriangle } from "lucide-react";

import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";


// Nota: Se o componente Drawer do shadcn não estiver instalado, este componente precisará ser ajustado.
// Como não vi 'drawer' no ls de components/ui, vou usar um Sheet ou um Dialog formatado.
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

interface TicketDetailsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: any;
}

export function TicketDetailsDrawer({ open, onOpenChange, ticket }: TicketDetailsDrawerProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const { data: messages = [] } = useQuery({
    queryKey: ['ticket-messages', ticket?.id],
    queryFn: () => getTicketMessages({ data: { ticketId: ticket.id } }),
    enabled: !!ticket?.id && open,
  });

  const { data: relatedArticles = [] } = useQuery({
    queryKey: ['related-kb-articles', ticket?.category, ticket?.source_module, ticket?.safe_code],
    queryFn: () => getRelatedArticles({ 
      data: { 
        category: ticket.category, 
        module: ticket.source_module, 
        safeCode: ticket.safe_code 
      } 
    }),
    enabled: !!ticket?.id && open,
  });

  const createKBArticleMutation = useMutation({
    mutationFn: () => createArticleFromTicket({
      data: {
        ticketId: ticket.id,
        title: `Documentação: ${ticket.subject}`,
        summary: `Procedimento de solução para: ${ticket.subject}`,
        category: ticket.category,
        module: ticket.source_module,
        content: {
          symptom: ticket.description,
          cause: "Causa em identificação.",
          solution: "Solução implementada e validada."
        }
      }
    }),
    onSuccess: (article) => {
      toast.success("Rascunho de artigo criado na base de conhecimento!");
      navigate({ to: `/suporte/conhecimento/${article.slug}` });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast.error(err.message);
    }
  });


  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Código copiado para a área de transferência");
    setTimeout(() => setCopied(false), 2000);
  };

  if (!ticket) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col h-full">
        <SheetHeader className="p-6 border-b bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs font-bold text-primary">{ticket.protocol}</span>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">{ticket.status}</Badge>
              <Badge variant="outline" className="text-[10px] text-blue-500">{ticket.priority}</Badge>
            </div>
          </div>
          <SheetTitle className="text-xl font-bold leading-tight">{ticket.subject}</SheetTitle>
          <SheetDescription className="text-xs flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1"><User className="w-3 h-3" /> {ticket.requester?.email || 'Usuário'}</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(ticket.created_at).toLocaleString('pt-BR')}</span>
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 p-6">
          <div className="space-y-8">
            {/* SLA Clock & Status */}
            <div className="bg-slate-900 text-white rounded-lg p-4 shadow-inner">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">SLA Operacional</span>
                <Badge className={ticket.sla_status === 'ATRASADO' ? 'bg-red-500' : 'bg-emerald-500'}>
                  {ticket.sla_status || 'NO_PRAZO'}
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-full">
                  <Zap className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <div className="text-lg font-mono font-bold">34:12 <span className="text-[10px] text-slate-400 font-sans">restantes</span></div>
                  <div className="text-[9px] text-slate-400 uppercase tracking-tighter">Prioridade: {ticket.priority}</div>
                </div>
              </div>
            </div>

            {/* Technical Context (Forensic) */}
            {(ticket.safe_code || ticket.related_protocol) && (
              <section className="space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <ShieldCheck className="w-3 h-3 text-primary" />
                  Diagnóstico Forense
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {ticket.safe_code && (
                    <div className="p-3 rounded-md border bg-slate-50 dark:bg-slate-900 group relative">
                      <div className="text-[9px] text-muted-foreground uppercase font-bold mb-1">Safe Code</div>
                      <div className="font-mono text-xs font-bold truncate pr-6">{ticket.safe_code}</div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyToClipboard(ticket.safe_code)}
                      >
                        {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      </Button>
                    </div>
                  )}
                  {ticket.related_protocol && (
                    <div className="p-3 rounded-md border bg-slate-50 dark:bg-slate-900">
                      <div className="text-[9px] text-muted-foreground uppercase font-bold mb-1">Protocolo Relacionado</div>
                      <div className="font-mono text-xs font-bold">{ticket.related_protocol}</div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Description */}
            <section className="space-y-2">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Descrição do Problema</h4>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {ticket.description}
              </p>
            </section>

            {/* Related KB Articles */}
            {relatedArticles.length > 0 && (
              <section className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <BookPlus className="w-3 h-3 text-primary" />
                  Artigos Relacionados
                </h4>
                <div className="space-y-2">
                  {relatedArticles.map((article: any) => (
                    <button
                      key={article.id}
                      onClick={() => {
                        navigate({ to: `/suporte/conhecimento/${article.slug}` });
                        onOpenChange(false);
                      }}
                      className="w-full flex items-center justify-between p-3 rounded-lg border bg-slate-50 dark:bg-slate-900/50 hover:border-primary/50 transition-colors group"
                    >
                      <div className="text-left">
                        <div className="text-[10px] font-bold group-hover:text-primary transition-colors">{article.title}</div>
                        <div className="text-[9px] text-muted-foreground line-clamp-1">{article.summary}</div>
                      </div>
                      <ArrowUpRight className="w-3 h-3 text-slate-300 group-hover:text-primary" />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Messages / Timeline */}

            <section className="space-y-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <History className="w-3 h-3" />
                Histórico e Mensagens
              </h4>
              <div className="space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center py-6 border rounded-lg border-dashed">
                    <p className="text-xs text-muted-foreground">Nenhuma mensagem ainda.</p>
                  </div>
                ) : (
                  messages.map((msg: any) => (
                    <div key={msg.id} className={`flex gap-3 ${msg.message_type === 'SISTEMA' ? 'justify-center' : ''}`}>
                      {msg.message_type === 'SISTEMA' ? (
                        <div className="bg-slate-100 dark:bg-slate-800 text-[10px] font-medium px-3 py-1 rounded-full text-muted-foreground border">
                          {msg.message}
                        </div>
                      ) : (
                        <div className="flex-1 bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold">Atendente</span>
                            <span className="text-[9px] text-muted-foreground">{new Date(msg.created_at).toLocaleTimeString('pt-BR')}</span>
                          </div>
                          <p className="text-sm">{msg.message}</p>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>
                </TabsContent>

                <TabsContent value="copilot" className="m-0 space-y-6">
                  <div className="bg-primary/5 rounded-xl p-4 border border-primary/10 space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <h4 className="text-xs font-black uppercase tracking-tighter text-primary">Copiloto Inteligente</h4>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Assistente de IA para suporte. As sugestões são baseadas na Base de Conhecimento publicada e no contexto do ticket.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-16 flex flex-col gap-1 items-start justify-center text-left hover:bg-primary/5 hover:border-primary/30 transition-all group"
                      onClick={() => {
                        toast.promise(summarizeTicket({ data: { ticketId: ticket.id } }), {
                          loading: 'Gerando resumo...',
                          success: (res) => {
                            console.log(res.summary);
                            return 'Resumo gerado (ver console)';
                          },
                          error: 'Erro ao resumir'
                        });
                      }}
                    >
                      <div className="flex items-center gap-2 text-[10px] font-bold group-hover:text-primary">
                        <Activity className="w-3.5 h-3.5" />
                        Resumir Chamado
                      </div>
                      <span className="text-[8px] text-muted-foreground font-normal">Sumário executivo do caso</span>
                    </Button>

                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-16 flex flex-col gap-1 items-start justify-center text-left hover:bg-primary/5 hover:border-primary/30 transition-all group"
                      onClick={() => {
                        toast.promise(suggestDiagnosis({ data: { ticketId: ticket.id } }), {
                          loading: 'Analisando evidências...',
                          success: 'Diagnóstico sugerido',
                          error: 'Erro na análise'
                        });
                      }}
                    >
                      <div className="flex items-center gap-2 text-[10px] font-bold group-hover:text-primary">
                        <BrainCircuit className="w-3.5 h-3.5" />
                        Sugerir Diagnóstico
                      </div>
                      <span className="text-[8px] text-muted-foreground font-normal">Identificar causa raiz</span>
                    </Button>

                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-16 flex flex-col gap-1 items-start justify-center text-left hover:bg-primary/5 hover:border-primary/30 transition-all group"
                      onClick={() => {
                        toast.promise(suggestReply({ data: { ticketId: ticket.id } }), {
                          loading: 'Preparando rascunho...',
                          success: 'Resposta sugerida',
                          error: 'Erro ao gerar resposta'
                        });
                      }}
                    >
                      <div className="flex items-center gap-2 text-[10px] font-bold group-hover:text-primary">
                        <MessageSquareCode className="w-3.5 h-3.5" />
                        Sugerir Resposta
                      </div>
                      <span className="text-[8px] text-muted-foreground font-normal">Rascunho para o atendente</span>
                    </Button>

                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-16 flex flex-col gap-1 items-start justify-center text-left hover:bg-primary/5 hover:border-primary/30 transition-all group"
                    >
                      <div className="flex items-center gap-2 text-[10px] font-bold group-hover:text-primary">
                        <Send className="w-3.5 h-3.5" />
                        Escalonamento
                      </div>
                      <span className="text-[8px] text-muted-foreground font-normal">Relatório para Nível 2</span>
                    </Button>
                  </div>

                  <Alert className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/30">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="text-[10px] font-black uppercase tracking-widest text-amber-700">Human-in-the-Loop</AlertTitle>
                    <AlertDescription className="text-[9px] text-amber-700/80 leading-relaxed font-medium">
                      IA sugere, Humano decide. O Copiloto não possui autonomia para enviar mensagens ou alterar dados sem sua revisão.
                    </AlertDescription>
                  </Alert>
                </TabsContent>

                <TabsContent value="history" className="m-0 space-y-6">
                  {/* ... conteúdo existente do histórico ... */}
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>


        <div className="p-6 border-t bg-slate-50/50 dark:bg-slate-900/50 flex items-center gap-2">
          <div className="flex items-center gap-2">
            {ticket.status === 'RESOLVIDO' && (
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2 border-primary/20 text-primary hover:bg-primary/5"
                onClick={() => createKBArticleMutation.mutate()}
                disabled={createKBArticleMutation.isPending}
              >
                {createKBArticleMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <BookPlus className="w-4 h-4" />
                )}
                Transformar em Artigo
              </Button>
            )}
            <Button className="flex-1 gap-2" size="sm">
              <MessageSquare className="w-4 h-4" />
              Responder
            </Button>
          </div>

        </div>
      </SheetContent>
    </Sheet>
  );
}
