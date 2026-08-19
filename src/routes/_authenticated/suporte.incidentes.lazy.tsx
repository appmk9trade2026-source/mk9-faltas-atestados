import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { 
  getIncidents, 
  runIncidentDetection, 
  confirmIncident, 
  resolveIncident 
} from '@/lib/incidents.functions';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  AlertTriangle, 
  CheckCircle2, 
  ShieldAlert, 
  RefreshCw,
  Search,
  ExternalLink,
  Bot
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from 'react';

export const Route = createFileRoute('/_authenticated/suporte/incidentes')({
  component: IncidentesDashboard,
});

function IncidentesDashboard() {
  const queryClient = useQueryClient();
  const fetchIncidents = useServerFn(getIncidents);
  const detectAction = useServerFn(runIncidentDetection);
  const confirmAction = useServerFn(confirmIncident);
  const resolveAction = useServerFn(resolveIncident);

  const { data: incidents, isLoading, refetch } = useQuery({
    queryKey: ['support_incidents'],
    queryFn: () => fetchIncidents(),
  });

  const detectMutation = useMutation({
    mutationFn: () => detectAction(),
    onSuccess: (newIncidents) => {
      queryClient.invalidateQueries({ queryKey: ['support_incidents'] });
      if (newIncidents.length > 0) {
        toast.success(`${newIncidents.length} novos potenciais incidentes detectados!`);
      } else {
        toast.info("Nenhum novo incidente detectado no momento.");
      }
    },
    onError: () => toast.error("Falha ao executar detecção."),
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Centro de Inteligência de Incidentes</h1>
          <p className="text-muted-foreground">Observação operacional e detecção determinística de falhas.</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button 
            onClick={() => detectMutation.mutate()}
            disabled={detectMutation.isPending}
          >
            <Bot className="h-4 w-4 mr-2" />
            Executar Detecção
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array(3).fill(0).map((_, i) => (
            <Card key={i} className="animate-pulse h-[200px]" />
          ))
        ) : incidents?.map((incident) => (
          <IncidentCard 
            key={incident.id} 
            incident={incident} 
            onUpdate={() => refetch()}
          />
        ))}

        {!isLoading && incidents?.length === 0 && (
          <div className="col-span-full py-12 text-center border rounded-lg bg-slate-50 dark:bg-slate-900/20">
            <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500 mb-4 opacity-50" />
            <h3 className="text-lg font-medium">Nenhum incidente ativo</h3>
            <p className="text-muted-foreground">O sistema está operando dentro dos thresholds normais.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function IncidentCard({ incident, onUpdate }: { incident: any, onUpdate: () => void }) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [severity, setSeverity] = useState(incident.severity || 'P2');
  
  const confirmAction = useServerFn(confirmIncident);
  const resolveAction = useServerFn(resolveIncident);

  const confirmMutation = useMutation({
    mutationFn: () => confirmAction({ data: { id: incident.id, severity: severity as any } }),
    onSuccess: () => {
      toast.success("Incidente confirmado e escalado.");
      setIsConfirmOpen(false);
      onUpdate();
    }
  });

  const resolveMutation = useMutation({
    mutationFn: () => resolveAction({ data: { id: incident.id, resolution_summary: "Incidente resolvido via dashboard." } }),
    onSuccess: () => {
      toast.success("Incidente marcado como resolvido.");
      onUpdate();
    }
  });

  const statusColors = {
    POTENTIAL: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500 border-yellow-200',
    CONFIRMED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-500 border-red-200',
    RESOLVED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-500 border-emerald-200',
  };

  const severityColors = {
    P0: 'bg-red-500 text-white',
    P1: 'bg-orange-500 text-white',
    P2: 'bg-yellow-500 text-white',
    P3: 'bg-blue-500 text-white',
  };

  return (
    <Card className={`relative overflow-hidden border-l-4 ${
      incident.status === 'CONFIRMED' ? 'border-l-red-500' : 
      incident.status === 'RESOLVED' ? 'border-l-emerald-500' : 'border-l-yellow-500'
    }`}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <Badge variant="outline" className={statusColors[incident.status as keyof typeof statusColors]}>
            {incident.status}
          </Badge>
          <span className="text-[10px] font-mono text-muted-foreground">
            {incident.protocol}
          </span>
        </div>
        <CardTitle className="text-lg mt-2 flex items-center gap-2">
          {incident.status === 'CONFIRMED' && <AlertTriangle className="h-4 w-4 text-red-500" />}
          {incident.title}
        </CardTitle>
        <CardDescription className="text-xs">
          Detectado em: {format(new Date(incident.created_at), "dd/MM HH:mm", { locale: ptBR })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded">
            <span className="text-muted-foreground block uppercase font-bold">Safe Code</span>
            <span className="font-mono">{incident.primary_safe_code || 'N/A'}</span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded">
            <span className="text-muted-foreground block uppercase font-bold">Módulo</span>
            <span>{incident.source_module}</span>
          </div>
        </div>

        <div className="flex justify-between items-center pt-2">
          <div className="flex gap-1">
            {incident.severity && (
              <Badge className={severityColors[incident.severity as keyof typeof severityColors]}>
                {incident.severity}
              </Badge>
            )}
          </div>
          
          <div className="flex gap-2">
            {incident.status === 'POTENTIAL' && (
              <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="destructive">
                    Confirmar
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Confirmar Incidente</DialogTitle>
                    <DialogDescription>
                      Isso escalará o incidente para P0/P1 e notificará os responsáveis.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <label className="text-sm font-medium mb-2 block">Severidade</label>
                    <Select value={severity} onValueChange={setSeverity}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a severidade" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="P0">P0 - Crítico (Sistema Inoperante)</SelectItem>
                        <SelectItem value="P1">P1 - Alta (Funcionalidade Core Quebrada)</SelectItem>
                        <SelectItem value="P2">P2 - Média (Funcionalidade com Gaps)</SelectItem>
                        <SelectItem value="P3">P3 - Baixa (Visual/Secundário)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsConfirmOpen(false)}>Cancelar</Button>
                    <Button variant="destructive" onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>
                      Confirmar e Escalar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            
            {incident.status === 'CONFIRMED' && (
              <Button size="sm" variant="outline" className="border-emerald-500 text-emerald-600 hover:bg-emerald-50" onClick={() => resolveMutation.mutate()} disabled={resolveMutation.isPending}>
                Resolver
              </Button>
            )}

            <Button size="sm" variant="ghost">
              Detalhes
              <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
