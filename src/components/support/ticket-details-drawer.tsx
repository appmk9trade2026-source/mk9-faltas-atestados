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
  Zap
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getTicketMessages } from "@/lib/support.functions";
import { toast } from "sonner";

// Nota: Se o componente Drawer do shadcn não estiver instalado, este componente precisará ser ajustado.
// Como não vi 'drawer' no ls de components/ui, vou usar um Sheet ou um Dialog formatado.
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

interface TicketDetailsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: any;
}

export function TicketDetailsDrawer({ open, onOpenChange, ticket }: TicketDetailsDrawerProps) {
  const [copied, setCopied] = useState(false);

  const { data: messages = [] } = useQuery({
    queryKey: ['ticket-messages', ticket?.id],
    queryFn: () => getTicketMessages({ data: { ticketId: ticket.id } }),
    enabled: !!ticket?.id && open,
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
          </div>
        </ScrollArea>

        <div className="p-6 border-t bg-slate-50/50 dark:bg-slate-900/50 flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Button className="flex-1 gap-2" size="sm">
              <MessageSquare className="w-4 h-4" />
              Responder
            </Button>
            {ticket.status !== 'RESOLVIDO' && (
              <Button variant="outline" size="sm">Resolver</Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
