import { createLazyFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  MessageSquare, 
  Plus, 
  Search, 
  Filter, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  User,
  History,
  BarChart3
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getTickets } from "@/lib/support.functions";
import { NovoChamadoDialog } from "@/components/support/novo-chamado-dialog";
import { ResolucaoChamadoDialog } from "@/components/support/resolucao-chamado-dialog";
import { useNavigate } from '@tanstack/react-router';
import { useSupport } from "@/components/support/support-provider";
import { reopenTicket } from "@/lib/support.functions";
import { toast } from "sonner";

export const Route = createLazyFileRoute('/_authenticated/suporte')({
  component: SupportPage,
});

function SupportPage() {
  const [isNovoChamadoOpen, setIsNovoChamadoOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isResolucaoOpen, setIsResolucaoOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['support-tickets'],
    queryFn: () => getTickets(),
  });

  const getStatusBadge = (status: string, slaStatus?: string) => {
    if (slaStatus === 'ATRASADO') {
      return (
        <Badge variant="destructive" className="gap-1 animate-pulse">
          <AlertCircle className="w-3 h-3" />
          SLA EXCEDIDO
        </Badge>
      );
    }

    switch (status) {
      case 'ABERTO': return <Badge variant="outline" className="border-blue-500 text-blue-500">ABERTO</Badge>;
      case 'EM_ATENDIMENTO': return <Badge className="bg-amber-500">EM ATENDIMENTO</Badge>;
      case 'AGUARDANDO_USUARIO': return <Badge variant="outline" className="border-slate-400 text-slate-500">AGUARDANDO USUÁRIO</Badge>;
      case 'RESOLVIDO': return <Badge className="bg-emerald-500">RESOLVIDO</Badge>;
      case 'FECHADO': return <Badge variant="secondary">FECHADO</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSLALabel = (ticket: any) => {
    if (ticket.status === 'RESOLVIDO' || ticket.status === 'FECHADO') return null;
    
    const colors: Record<string, string> = {
      'NO_PRAZO': 'text-emerald-500',
      'ATENCAO': 'text-amber-500',
      'ATRASADO': 'text-red-500',
      'PAUSADO': 'text-slate-400'
    };

    const labels: Record<string, string> = {
      'NO_PRAZO': 'No prazo',
      'ATENCAO': 'Atenção',
      'ATRASADO': 'SLA excedido',
      'PAUSADO': 'SLA pausado'
    };

    const status = ticket.sla_status || 'NO_PRAZO';

    return (
      <span className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-widest ${colors[status]}`}>
        {status === 'NO_PRAZO' ? '🟢' : status === 'ATENCAO' ? '🟡' : '🔴'} {labels[status]}
      </span>
    );
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENTE': return 'text-red-500';
      case 'ALTA': return 'text-orange-500';
      case 'NORMAL': return 'text-blue-500';
      default: return 'text-slate-500';
    }
  };

  return (
    <AppShell title="Central de Suporte" breadcrumb={["Suporte"]}>
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Central de Suporte Interno</h1>
            <p className="text-muted-foreground text-sm">
              Gerencie seus chamados e acompanhe resoluções técnicas.
            </p>
          </div>
          <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
            <Button className="w-full md:w-auto gap-2" onClick={() => setIsNovoChamadoOpen(true)}>
              <Plus className="w-4 h-4" />
              Novo Chamado
            </Button>
            <Button variant="outline" className="w-full md:w-auto gap-2" onClick={() => navigate({ to: '/suporte/dashboard' })}>
              <BarChart3 className="w-4 h-4" />
              Dashboard
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <aside className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Filter className="w-4 h-4 text-primary" />
                  FILTROS
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar protocolo..." className="pl-9 text-xs" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Status</label>
                  <div className="flex flex-col gap-1">
                    {['Todos', 'Abertos', 'Em atendimento', 'Resolvidos'].map(s => (
                      <Button key={s} variant="ghost" size="sm" className="justify-start text-xs font-medium px-2 h-8">
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-50 dark:bg-slate-900/50 border-dashed">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-primary tracking-tighter">
                  <History className="w-3 h-3" />
                  Contexto Operacional
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Chamados vinculados a falhas operacionais herdam automaticamente Protocolo e Safe Code.
                </p>
              </CardContent>
            </Card>
          </aside>

          <main className="lg:col-span-3 space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : tickets.length === 0 ? (
              <Card className="border-dashed flex flex-col items-center justify-center py-20 text-center">
                <MessageSquare className="w-12 h-12 text-slate-300 mb-4" />
                <CardTitle className="text-lg text-slate-400">Nenhum chamado encontrado</CardTitle>
                <p className="text-sm text-slate-400 mt-1">Clique em "Novo Chamado" para começar.</p>
              </Card>
            ) : (
              tickets.map((ticket: any) => (
                <Card key={ticket.id} className="hover:border-primary/50 transition-colors cursor-pointer group">
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-primary">{ticket.protocol}</span>
                          {getStatusBadge(ticket.status, ticket.sla_status)}
                          <Badge variant="outline" className={`text-[9px] font-bold ${getPriorityColor(ticket.priority)}`}>
                            {ticket.priority}
                          </Badge>
                          {getSLALabel(ticket)}
                        </div>
                        <h3 className="font-bold text-base group-hover:text-primary transition-colors">{ticket.subject}</h3>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground font-medium">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3" />
                            {new Date(ticket.created_at).toLocaleString('pt-BR')}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <AlertCircle className="w-3 h-3" />
                            {ticket.category}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <User className="w-3 h-3" />
                            {ticket.requester?.email || 'Usuário'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {ticket.assigned_user_id ? (
                          <div className="flex flex-col items-end">
                            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground opacity-60">Atendente</span>
                            <span className="text-xs font-bold">{ticket.assigned?.email.split('@')[0]}</span>
                          </div>
                        ) : (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="text-xs font-bold"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Assumir
                          </Button>
                        )}
                        {ticket.assigned_user_id && ticket.status !== 'RESOLVIDO' && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTicketId(ticket.id);
                              setIsResolucaoOpen(true);
                            }}
                          >
                            Resolver
                          </Button>
                        )}
                        {ticket.status === 'RESOLVIDO' && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="text-xs font-bold"
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await reopenTicket({ data: { ticketId: ticket.id } });
                                toast.success("Chamado reaberto.");
                                queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
                              } catch (err: any) {
                                toast.error(err.message);
                              }
                            }}
                          >
                            Reabrir
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </main>
        </div>
        <NovoChamadoDialog 
          open={isNovoChamadoOpen} 
          onOpenChange={setIsNovoChamadoOpen} 
        />
        {selectedTicketId && (
          <ResolucaoChamadoDialog
            open={isResolucaoOpen}
            onOpenChange={setIsResolucaoOpen}
            ticketId={selectedTicketId}
          />
        )}
      </div>
    </AppShell>
  );
}
